import { randomInt } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BLOB_DIR, CODE_LENGTH, MAX_FILE_BYTES } from './config.ts';
import { db } from './db.ts';
import { EXPIRY_OPTIONS, type Expiry, type Item } from '#lib/types.ts';

type Row = {
	code: string;
	kind: 'paste' | 'file';
	name: string;
	mime: string;
	size: number;
	created_at: number;
	expires_at: number | null;
	burn: number;
	views: number;
};

const COLUMNS = 'code, kind, name, mime, size, created_at, expires_at, burn, views';

const toItem = (r: Row): Item => ({
	code: r.code,
	kind: r.kind,
	name: r.name,
	mime: r.mime,
	size: r.size,
	createdAt: r.created_at,
	expiresAt: r.expires_at,
	burn: !!r.burn,
	views: r.views
});

export class TooLargeError extends Error {}

export const isCode = (s: string) => /^\d{6,12}$/.test(s);

export function blobPath(code: string): string {
	if (!isCode(code)) throw new Error('Bad code');
	return join(BLOB_DIR, code);
}

export function expiresAt(expiry: string | null | undefined, now = Date.now()): number | null {
	const opt = EXPIRY_OPTIONS.find((o) => o.value === expiry) ?? EXPIRY_OPTIONS.find((o) => o.value === '1d')!;
	return opt.ms === null ? null : now + opt.ms;
}

/** A random numeric code that isn't taken. Easy to read out or type on a phone. */
function newCode(): string {
	const exists = db.prepare('SELECT 1 FROM items WHERE code = ?');
	for (;;) {
		let code = String(randomInt(1, 10)); // no leading zero, so it survives being treated as a number
		while (code.length < CODE_LENGTH) code += randomInt(0, 10);
		if (!exists.get(code)) return code;
	}
}

type Options = { expiry?: Expiry | string | null; burn?: boolean };

export function createPaste(content: string, title: string, opts: Options): Item {
	const code = newCode();
	const now = Date.now();
	db.prepare(
		'INSERT INTO items (code, kind, name, mime, size, content, created_at, expires_at, burn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
	).run(code, 'paste', title.slice(0, 200), 'text/plain', Buffer.byteLength(content), content, now, expiresAt(opts.expiry, now), opts.burn ? 1 : 0);
	return getItem(code)!;
}

/** Streams an upload to disk, then records it. Refuses (and cleans up) past MAX_FILE_BYTES. */
export async function createFile(body: ReadableStream<Uint8Array>, name: string, mime: string, opts: Options): Promise<Item> {
	const code = newCode();
	const tmp = join(BLOB_DIR, `.${code}.part`);
	let size = 0;
	const limit = new Transform({
		transform(chunk: Buffer, _enc, cb) {
			size += chunk.length;
			if (size > MAX_FILE_BYTES) cb(new TooLargeError(`Files can be up to ${Math.round(MAX_FILE_BYTES / 1048576)} MB`));
			else cb(null, chunk);
		}
	});
	const out = createWriteStream(tmp, { mode: 0o600 });
	try {
		await pipeline(Readable.fromWeb(body as import('node:stream/web').ReadableStream), limit, out);
		// The row goes in before the blob appears, so sweep() never sees a blob without one.
		const now = Date.now();
		db.prepare(
			'INSERT INTO items (code, kind, name, mime, size, created_at, expires_at, burn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		).run(code, 'file', cleanName(name), mime || 'application/octet-stream', size, now, expiresAt(opts.expiry, now), opts.burn ? 1 : 0);
		await rename(tmp, blobPath(code)).catch((err) => {
			db.prepare('DELETE FROM items WHERE code = ?').run(code);
			throw err;
		});
	} catch (err) {
		// The file may still be opening when the pipeline fails; remove it once it's closed.
		if (!out.closed) await new Promise((r) => out.once('close', r));
		await rm(tmp, { force: true });
		throw err;
	}
	return getItem(code)!;
}

/** File names come from the client: keep them printable and free of path separators. */
export function cleanName(name: string): string {
	const base = name.split(/[/\\]/).pop() ?? '';
	// eslint-disable-next-line no-control-regex
	return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255) || 'file';
}

/** The item, unless it doesn't exist or has expired. */
export function getItem(code: string): Item | null {
	if (!isCode(code)) return null;
	const row = db.prepare(`SELECT ${COLUMNS} FROM items WHERE code = ?`).get(code) as Row | undefined;
	if (!row) return null;
	if (row.expires_at !== null && row.expires_at <= Date.now()) {
		void deleteItem(code);
		return null;
	}
	return toItem(row);
}

export function getPasteContent(code: string): string | null {
	const row = db.prepare("SELECT content FROM items WHERE code = ? AND kind = 'paste'").get(code) as { content: string } | undefined;
	return row?.content ?? null;
}

export function countView(code: string) {
	db.prepare('UPDATE items SET views = views + 1 WHERE code = ?').run(code);
}

export function listItems(): Item[] {
	const rows = db
		.prepare(`SELECT ${COLUMNS} FROM items WHERE expires_at IS NULL OR expires_at > ? ORDER BY created_at DESC LIMIT 200`)
		.all(Date.now()) as Row[];
	return rows.map(toItem);
}

export async function deleteItem(code: string): Promise<boolean> {
	const claimed = claim(code);
	await deleteBlob(code);
	return claimed;
}

/** Removes the row; true for exactly one caller, so a burn-after-read item opens once. */
export function claim(code: string): boolean {
	return Number(db.prepare('DELETE FROM items WHERE code = ?').run(code).changes) > 0;
}

export const deleteBlob = (code: string) => rm(blobPath(code), { force: true });

/** Removes expired items, and blobs left behind by crashes or interrupted uploads. */
export async function sweep() {
	const expired = db.prepare('SELECT code FROM items WHERE expires_at IS NOT NULL AND expires_at <= ?').all(Date.now()) as { code: string }[];
	for (const { code } of expired) await deleteItem(code);
	const files = await readdir(BLOB_DIR, { withFileTypes: true });
	// Read after listing the folder: a blob is only renamed into place once its row exists.
	const known = new Set((db.prepare("SELECT code FROM items WHERE kind = 'file'").all() as { code: string }[]).map((r) => r.code));
	const hourAgo = Date.now() - 3_600_000;
	for (const f of files) {
		if (!f.isFile()) continue;
		const path = join(BLOB_DIR, f.name);
		// Uploads in progress are .part files; only old ones are abandoned.
		const stale = f.name.endsWith('.part') ? (await stat(path)).mtimeMs < hourAgo : !known.has(f.name);
		if (stale) await rm(path, { force: true });
	}
}
