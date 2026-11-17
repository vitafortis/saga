import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { blobPath, getPasteContent } from './store.ts';
import { OPENSSL_ARGS } from '#lib/crypto.ts';
import type { Collection, Item } from '#lib/types.ts';

/**
 * An item's bytes: a paste's text, or a file's blob, streamed. Encrypted pastes come out as
 * binary ciphertext, the same format as encrypted files.
 */
export async function* contentOf(item: Item): AsyncGenerator<Buffer> {
	if (item.kind === 'paste') {
		const text = getPasteContent(item.code) ?? '';
		yield item.encrypted ? Buffer.from(text, 'base64') : Buffer.from(text);
	} else for await (const chunk of createReadStream(blobPath(item.code))) yield chunk as Buffer;
}

/** Bytes in contentOf(item). */
export const contentSize = (item: Item) => (item.kind === 'paste' && item.encrypted ? Buffer.from(getPasteContent(item.code) ?? '', 'base64').length : item.size);

/** Where an item goes in the archive: its target path (without / or ~/), or its name; encrypted ones end in .enc. */
function archiveName(item: Item): string {
	return ((item.path ?? item.name).replace(/^~?\/+/, '') || item.code) + (item.encrypted ? '.enc' : '');
}

/** Names unique within the archive: a second `config.yaml` becomes `config (2).yaml`. */
function uniqueNames(items: Item[], nameOf: (item: Item) => string): string[] {
	const seen = new Map<string, number>();
	return items.map((item) => {
		const name = nameOf(item);
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

export type TarEntry = { path: string; size: number; mode: number; mtime: number; content: AsyncIterable<Buffer> };

/** A .tar.gz of `entries`, streamed. Each entry's content must be exactly `size` bytes. */
export function tarGz(entries: Iterable<TarEntry> | AsyncIterable<TarEntry>): Readable {
	async function* tar() {
		for await (const e of entries) {
			yield tarHeader(e.path, e.size, e.mode, e.mtime);
			let sent = 0;
			for await (const chunk of e.content) {
				sent += chunk.length;
				yield chunk;
			}
			if (sent !== e.size) throw new Error(`${e.path} changed while being archived`);
			if (sent % 512) yield Buffer.alloc(512 - (sent % 512));
		}
		yield Buffer.alloc(1024);
	}
	return Readable.from(tar()).pipe(createGzip());
}

/** The collection as a .tar.gz, streamed: files at their target paths (or by name). */
export function archive(items: Item[], nameOf = archiveName): ReadableStream {
	const names = uniqueNames(items, nameOf);
	const entries = items.map((item, i) => ({
		path: names[i],
		size: contentSize(item),
		mode: parseInt(item.mode ?? '644', 8),
		mtime: item.createdAt,
		content: contentOf(item)
	}));
	return Readable.toWeb(tarGz(entries)) as ReadableStream;
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
 * Encrypted files also need openssl, and ask for the password once (or take it from SAGA_PASS).
 */
export async function installScript(collection: Collection, items: Item[], url: string): Promise<string> {
	const placed = items.filter((i) => i.path);
	const skipped = items.filter((i) => !i.path);
	const encrypted = placed.filter((i) => i.encrypted);
	const lines = [
		'#!/bin/sh',
		`# Saga collection: ${collection.name.replace(/\n/g, ' ')} (${collection.code})`,
		`# ${url}`,
		'#',
		`# Writes ${placed.length} ${placed.length === 1 ? 'file' : 'files'}. A file that already exists and differs is kept as <file>.saga-bak.`,
		`# With sagacp:  sagacp --install ${collection.code}   (add --dry-run to preview, --root for /etc and other system paths)`,
		'# With curl:     curl -fsSL -H "Authorization: Bearer $KEY" <this url> | sh   (sh -s -- --dry-run to preview; | sudo sh for system paths)',
		...(encrypted.length
			? ['#', `# ${encrypted.length} encrypted: asks for the password (or set SAGA_PASS), and needs openssl 1.1.1 or later.`]
			: []),
		...(skipped.length ? ['#', `# Not placed (no target path): ${skipped.map((i) => i.name).join(', ')}`] : []),
		'',
		'set -eu',
		'dry=0',
		'[ "${1:-}" = "--dry-run" ] && dry=1',
		'command -v base64 >/dev/null 2>&1 || { echo "saga: base64 is required" >&2; exit 1; }',
		'',
		...(encrypted.length
			? [
					'# The password is read once, from the terminal even when this script is piped to sh.',
					'if [ "$dry" = 0 ] && [ -z "${SAGA_PASS:-}" ]; then',
					'\tcommand -v openssl >/dev/null 2>&1 || { echo "saga: openssl is required for encrypted files" >&2; exit 1; }',
					// A failed `exec` redirection ends the script, so try opening the terminal in a subshell first.
					'\t(: </dev/tty) 2>/dev/null || { echo "saga: no terminal to ask for the password; set SAGA_PASS" >&2; exit 1; }',
					'\texec 3</dev/tty',
					'\tprintf "Password for encrypted files: " >/dev/tty',
					'\ttrap \'stty echo <&3 2>/dev/null\' EXIT INT TERM',
					'\tstty -echo <&3 2>/dev/null || true',
					'\tIFS= read -r SAGA_PASS <&3 || true',
					'\tstty echo <&3 2>/dev/null || true',
					'\techo >/dev/tty',
					'fi',
					'export SAGA_PASS',
					''
				]
			: []),
		'put() { # put <path> <mode> [enc], with the base64 content on stdin',
		'\ttarget=$1 mode=$2 enc=${3:-}',
		'\tif [ "$dry" = 1 ]; then cat >/dev/null; echo "would write $target${mode:+ ($mode)}${enc:+ (encrypted)}"; return; fi',
		'\tmkdir -p "$(dirname "$target")"',
		'\ttmp=$(mktemp "$target.saga-XXXXXX")',
		'\tif [ -n "$enc" ]; then',
		`\t\tbase64 -d | openssl enc -d ${OPENSSL_ARGS} -pass env:SAGA_PASS >"$tmp" 2>/dev/null || { rm -f "$tmp"; echo "saga: wrong password (or openssl too old) for $target" >&2; exit 1; }`,
		'\telse',
		'\t\tbase64 -d >"$tmp"',
		'\tfi',
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
		lines.push(`put ${shPath(item.path!)} '${item.mode ?? ''}'${item.encrypted ? ' enc' : ''} <<'SAGA_${item.code}'`, b64.trimEnd(), `SAGA_${item.code}`, '');
	}
	lines.push(`[ "$dry" = 1 ] || echo "saga: done (${placed.length} ${placed.length === 1 ? 'file' : 'files'})"`, '');
	return lines.join('\n');
}
