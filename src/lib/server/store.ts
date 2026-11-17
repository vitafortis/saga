import { randomInt } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BLOB_DIR, CODE_LENGTH, MAX_FILE_BYTES } from './config.ts';
import { db } from './db.ts';
import { EXPIRY_OPTIONS, isExpiry, type Expiry, type Item } from '#lib/types.ts';
import { getSettings } from './settings.ts';
import { TEXT_PREFIX } from '#lib/crypto.ts';

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
	collection: string | null;
	path: string | null;
	mode: string | null;
	encrypted: number;
};

const COLUMNS = 'code, kind, name, mime, size, created_at, expires_at, burn, views, collection, path, mode, encrypted';

const toItem = (r: Row): Item => ({
	code: r.code,
	kind: r.kind,
	name: r.name,
	mime: r.mime,
	size: r.size,
	createdAt: r.created_at,
	expiresAt: r.expires_at,
	burn: !!r.burn,
	views: r.views,
	collection: r.collection,
	path: r.path,
	mode: r.mode,
	encrypted: !!r.encrypted
});

export class TooLargeError extends Error {}
export class NotEncryptedError extends Error {
	constructor() {
		super('Marked encrypted, but this isn’t Saga/openssl ciphertext');
	}
}

/** An encrypted paste is single-line base64 of openssl's format. */
export const isEncryptedText = (s: string) => s.startsWith(TEXT_PREFIX) && /^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0;

export const isCode = (s: string) => /^\d{6,12}$/.test(s);

export function blobPath(code: string): string {
	if (!isCode(code)) throw new Error('Bad code');
	return join(BLOB_DIR, code);
}

/** When an item made now expires; a missing or unknown `expiry` uses the default from Settings. */
export function expiresAt(expiry: string | null | undefined, now = Date.now()): number | null {
	const value = isExpiry(expiry) ? expiry : getSettings().defaultExpiry;
	const opt = EXPIRY_OPTIONS.find((o) => o.value === value)!;
	return opt.ms === null ? null : now + opt.ms;
}

/** A random numeric code that isn't taken. Easy to read out or type on a phone. */
export function newCode(): string {
	// Items and collections share one space of codes, so /<code> finds either.
	const exists = db.prepare('SELECT 1 FROM items WHERE code = ?1 UNION ALL SELECT 1 FROM collections WHERE code = ?1');
	for (;;) {
		let code = String(randomInt(1, 10)); // no leading zero, so it survives being treated as a number
		while (code.length < CODE_LENGTH) code += randomInt(0, 10);
		if (!exists.get(code)) return code;
	}
}

type Options = {
	expiry?: Expiry | string | null;
	burn?: boolean;
	/** Adds the item to this collection: it then never expires and can be opened any number of times. */
	collection?: string;
	path?: string | null;
	mode?: string | null;
	/** The client encrypted it (see crypto.ts); checked to really be ciphertext. */
	encrypted?: boolean;
};

/** Target paths for the install script: absolute or under ~/, no `..`, printable. */
export function cleanPath(path: string | null | undefined): string | null | Error {
	const p = (path ?? '').trim();
	if (!p) return null;
	// eslint-disable-next-line no-control-regex
	if (!/^(\/|~\/)/.test(p) || /[\u0000-\u001f\u007f]/.test(p) || p.split('/').includes('..') || p.endsWith('/') || p.length > 1024) {
		return new Error('Paths start with / or ~/, name a file, and can’t contain ..');
	}
	return p;
}

export function cleanMode(mode: string | null | undefined): string | null | Error {
	const m = (mode ?? '').trim();
	if (!m) return null;
	return /^0?[0-7]{3}$/.test(m) ? m.replace(/^0/, '') : new Error('Mode is octal, like 644 or 600');
}

/** Columns shared by both kinds of item, with collection items pinned to never expire or burn. */
function common(opts: Options, now: number) {
	const encrypted = opts.encrypted ? 1 : 0;
	if (opts.collection) return { expires: null, burn: 0, collection: opts.collection, path: opts.path ?? null, mode: opts.mode ?? null, encrypted };
	return { expires: expiresAt(opts.expiry, now), burn: opts.burn ? 1 : 0, collection: null, path: null, mode: null, encrypted };
}

export function createPaste(content: string, title: string, opts: Options): Item {
	if (opts.encrypted) {
		content = content.trim();
		if (!isEncryptedText(content)) throw new NotEncryptedError();
	}
	const code = newCode();
	const now = Date.now();
	const c = common(opts, now);
	db.prepare(
		'INSERT INTO items (code, kind, name, mime, size, content, created_at, expires_at, burn, collection, path, mode, encrypted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
	).run(code, 'paste', title.slice(0, 200), 'text/plain', Buffer.byteLength(content), content, now, c.expires, c.burn, c.collection, c.path, c.mode, c.encrypted);
	touchCollection(opts.collection);
	return getItem(code)!;
}

/** Streams an upload to disk, then records it. Refuses (and cleans up) past MAX_FILE_BYTES. */
export async function createFile(body: ReadableStream<Uint8Array>, name: string, mime: string, opts: Options): Promise<Item> {
	const code = newCode();
	const tmp = join(BLOB_DIR, `.${code}.part`);
	let size = 0;
	let head = Buffer.alloc(0);
	const limit = new Transform({
		transform(chunk: Buffer, _enc, cb) {
			size += chunk.length;
			if (opts.encrypted && head.length < 8) head = Buffer.concat([head, chunk]).subarray(0, 8);
			if (size > MAX_FILE_BYTES) cb(new TooLargeError(`Files can be up to ${Math.round(MAX_FILE_BYTES / 1048576)} MB`));
			// Not ciphertext: read to the end and refuse then, so the client gets the reason (not a dropped connection).
			else if (opts.encrypted && head.length === 8 && head.toString('latin1') !== 'Salted__') cb();
			else cb(null, chunk);
		},
		flush(cb) {
			cb(opts.encrypted && head.toString('latin1') !== 'Salted__' ? new NotEncryptedError() : null);
		}
	});
	const out = createWriteStream(tmp, { mode: 0o600 });
	try {
		await pipeline(Readable.fromWeb(body as import('node:stream/web').ReadableStream), limit, out);
		// The row goes in before the blob appears, so sweep() never sees a blob without one.
		const now = Date.now();
		const c = common(opts, now);
		db.prepare(
			'INSERT INTO items (code, kind, name, mime, size, created_at, expires_at, burn, collection, path, mode, encrypted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
		).run(code, 'file', cleanName(name), mime || 'application/octet-stream', size, now, c.expires, c.burn, c.collection, c.path, c.mode, c.encrypted);
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
	touchCollection(opts.collection);
	return getItem(code)!;
}

export function touchCollection(code: string | null | undefined) {
	if (code) db.prepare('UPDATE collections SET updated_at = ? WHERE code = ?').run(Date.now(), code);
}

/** Renames an item, moves it (path, mode) or replaces a paste's text. */
export function updateItem(
	code: string,
	changes: { name?: string; path?: string | null; mode?: string | null; content?: string; expiresAt?: number | null }
): Item | null {
	const item = getItem(code);
	if (!item) return null;
	if (changes.name !== undefined) db.prepare('UPDATE items SET name = ? WHERE code = ?').run(item.kind === 'file' ? cleanName(changes.name) : changes.name.slice(0, 200), code);
	if (changes.path !== undefined) db.prepare('UPDATE items SET path = ? WHERE code = ?').run(changes.path, code);
	if (changes.mode !== undefined) db.prepare('UPDATE items SET mode = ? WHERE code = ?').run(changes.mode, code);
	if (changes.expiresAt !== undefined) db.prepare('UPDATE items SET expires_at = ? WHERE code = ?').run(changes.expiresAt, code);
	if (changes.content !== undefined && item.kind === 'paste') {
		db.prepare('UPDATE items SET content = ?, size = ? WHERE code = ?').run(changes.content, Buffer.byteLength(changes.content), code);
	}
	touchCollection(item.collection);
	return getItem(code);
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
		.prepare(`SELECT ${COLUMNS} FROM items WHERE collection IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 200`)
		.all(Date.now()) as Row[];
	return rows.map(toItem);
}

export function usage(): { count: number; bytes: number } {
	const r = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM items WHERE expires_at IS NULL OR expires_at > ?').get(Date.now()) as {
		count: number;
		bytes: number;
	};
	return { count: Number(r.count), bytes: Number(r.bytes) };
}

export async function deleteItem(code: string): Promise<boolean> {
	const row = db.prepare('SELECT collection FROM items WHERE code = ?').get(code) as { collection: string | null } | undefined;
	const claimed = claim(code);
	touchCollection(row?.collection);
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
