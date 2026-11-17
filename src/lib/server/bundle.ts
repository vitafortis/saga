import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { blobPath, getPasteContent } from './store.ts';
import type { Collection, Item } from '#lib/types.ts';

/** An item's bytes: a paste's text, or a file's blob, streamed. */
async function* contentOf(item: Item): AsyncGenerator<Buffer> {
	if (item.kind === 'paste') yield Buffer.from(getPasteContent(item.code) ?? '');
	else for await (const chunk of createReadStream(blobPath(item.code))) yield chunk as Buffer;
}

/** Where an item goes in the archive: its target path (without / or ~/), or its name. */
function archiveName(item: Item): string {
	return (item.path ?? item.name).replace(/^~?\/+/, '') || item.code;
}

/** Names unique within the archive: a second `config.yaml` becomes `config (2).yaml`. */
function uniqueNames(items: Item[]): string[] {
	const seen = new Map<string, number>();
	return items.map((item) => {
		const name = archiveName(item);
		const n = (seen.get(name) ?? 0) + 1;
		seen.set(name, n);
		return n === 1 ? name : name.replace(/(\.[^./]+)?$/, ` (${n})$1`);
	});
}

/** A ustar header. Long paths go in the 155-byte prefix; anything longer is cut. */
function tarHeader(path: string, size: number, mode: number, mtime: number): Buffer {
	const h = Buffer.alloc(512);
	let name = Buffer.from(path);
	let prefix = Buffer.alloc(0);
	if (name.length > 100) {
		const cut = path.lastIndexOf('/', path.length - 1);
		const p = Buffer.from(path.slice(0, Math.max(0, cut)));
		const n = Buffer.from(path.slice(cut + 1));
		if (cut > 0 && p.length <= 155 && n.length <= 100) [prefix, name] = [p, n];
		else name = name.subarray(name.length - 100);
	}
	const octal = (v: number, len: number) => v.toString(8).padStart(len - 1, '0') + '\0';
	name.copy(h, 0);
	h.write(octal(mode, 8), 100);
	h.write(octal(0, 8), 108);
	h.write(octal(0, 8), 116);
	h.write(octal(size, 12), 124);
	h.write(octal(Math.floor(mtime / 1000), 12), 136);
	h.write('        ', 148);
	h.write('0', 156);
	h.write('ustar\0' + '00', 257);
	prefix.copy(h, 345);
	let sum = 0;
	for (const b of h) sum += b;
	h.write(octal(sum, 7) + ' ', 148);
	return h;
}

/** The collection as a .tar.gz, streamed: files at their target paths (or by name). */
export function archive(items: Item[]): ReadableStream {
	const names = uniqueNames(items);
	async function* tar() {
		for (const [i, item] of items.entries()) {
			yield tarHeader(names[i], item.size, parseInt(item.mode ?? '644', 8), item.createdAt);
			let sent = 0;
			for await (const chunk of contentOf(item)) {
				sent += chunk.length;
				yield chunk;
			}
			if (sent % 512) yield Buffer.alloc(512 - (sent % 512));
		}
		yield Buffer.alloc(1024);
	}
	return Readable.toWeb(Readable.from(tar()).pipe(createGzip())) as ReadableStream;
}

/** Single-quotes for sh; `~/x` becomes "$HOME"/'x' so the home folder expands. */
function shPath(path: string): string {
	const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
	return path.startsWith('~/') ? `"$HOME"/${q(path.slice(2))}` : q(path);
}

/**
 * A POSIX sh script that writes each placed file to its path. Files are embedded as base64,
 * so the script needs nothing but sh, base64, mktemp and cmp (BusyBox, macOS and Linux all have them).
 * Existing files that differ are kept as <file>.saga-bak; identical ones are left alone.
 */
export async function installScript(collection: Collection, items: Item[], url: string): Promise<string> {
	const placed = items.filter((i) => i.path);
	const skipped = items.filter((i) => !i.path);
	const lines = [
		'#!/bin/sh',
		`# Saga collection: ${collection.name.replace(/\n/g, ' ')} (${collection.code})`,
		`# ${url}`,
		'#',
		`# Writes ${placed.length} ${placed.length === 1 ? 'file' : 'files'}. A file that already exists and differs is kept as <file>.saga-bak.`,
		`# With sagacp:  sagacp --install ${collection.code}   (add --dry-run to preview, --root for /etc and other system paths)`,
		'# With curl:     curl -fsSL -H "Authorization: Bearer $KEY" <this url> | sh   (sh -s -- --dry-run to preview; | sudo sh for system paths)',
		...(skipped.length ? ['#', `# Not placed (no target path): ${skipped.map((i) => i.name).join(', ')}`] : []),
		'',
		'set -eu',
		'dry=0',
		'[ "${1:-}" = "--dry-run" ] && dry=1',
		'command -v base64 >/dev/null 2>&1 || { echo "saga: base64 is required" >&2; exit 1; }',
		'',
		'put() { # put <path> <mode>, with the base64 content on stdin',
		'\ttarget=$1 mode=$2',
		'\tif [ "$dry" = 1 ]; then cat >/dev/null; echo "would write $target${mode:+ ($mode)}"; return; fi',
		'\tmkdir -p "$(dirname "$target")"',
		'\ttmp=$(mktemp "$target.saga-XXXXXX")',
		'\tbase64 -d >"$tmp"',
		'\tchmod "${mode:-644}" "$tmp"',
		'\tif [ -f "$target" ] && cmp -s "$tmp" "$target"; then rm -f "$tmp"; echo "unchanged $target"; return; fi',
		'\t[ -f "$target" ] && cp -p "$target" "$target.saga-bak" && echo "backed up $target -> $target.saga-bak"',
		'\tmv -f "$tmp" "$target"',
		'\techo "wrote $target"',
		'}',
		''
	];
	for (const item of placed) {
		const chunks: Buffer[] = [];
		for await (const c of contentOf(item)) chunks.push(c);
		const b64 = Buffer.concat(chunks).toString('base64').replace(/.{1,76}/g, '$&\n');
		lines.push(`put ${shPath(item.path!)} '${item.mode ?? ''}' <<'SAGA_${item.code}'`, b64.trimEnd(), `SAGA_${item.code}`, '');
	}
	lines.push(`[ "$dry" = 1 ] || echo "saga: done (${placed.length} ${placed.length === 1 ? 'file' : 'files'})"`, '');
	return lines.join('\n');
}
