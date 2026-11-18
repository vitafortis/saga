import { DatabaseSync } from 'node:sqlite';
import { chmod, mkdir, open, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { BACKUP_DIR, BACKUP_HOURS, BACKUP_KEEP, BLOB_DIR, DATA_DIR } from './config.ts';
import { db } from './db.ts';
import { contentOf, installScript, tarGz, type TarEntry } from './bundle.ts';
import { cleanName } from './store.ts';
import type { BackupStatus, Collection, Item, Snapshot } from '#lib/types.ts';

/**
 * Two ways onto the NAS:
 * - Snapshots: the whole of Saga (database, files, session key) as one .tar.gz, on a schedule.
 *   Restoring is extracting one into an empty data volume.
 * - Saved copies: one item or collection as plain files in a readable folder tree, on demand.
 * Encrypted items stay encrypted in both.
 */

export class BackupsOffError extends Error {
	constructor() {
		super('Backups are off: mount a NAS folder and set SAGA_BACKUP_DIR (see compose.yaml)');
	}
}


const SNAPSHOTS = () => join(BACKUP_DIR, 'snapshots');
const SAVED = () => join(BACKUP_DIR, 'saved');

let running: Promise<Snapshot> | null = null;
let lastError: string | null = null;

export async function listSnapshots(): Promise<Snapshot[]> {
	if (!BACKUP_DIR) return [];
	const names = (await readdir(SNAPSHOTS()).catch(() => [] as string[])).filter((n) => /^saga-[\d-]+\.tar\.gz$/.test(n));
	const out = await Promise.all(names.map(async (name) => ({ name, ...(await stat(join(SNAPSHOTS(), name))) })));
	return out.map((s) => ({ name: s.name, size: s.size, createdAt: s.mtimeMs })).sort((a, b) => b.createdAt - a.createdAt);
}

export async function backupStatus(): Promise<BackupStatus> {
	return {
		enabled: !!BACKUP_DIR,
		dir: BACKUP_DIR,
		everyHours: BACKUP_HOURS,
		keep: BACKUP_KEEP,
		running: !!running,
		lastError,
		snapshots: await listSnapshots()
	};
}

/** 20261117-014301 (UTC). */
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

/** One file on disk as a tar entry, opened first so a burn or delete mid-archive can't change it. */
async function fileEntry(path: string, name: string, mode = 0o600): Promise<TarEntry | null> {
	const fh = await open(path).catch(() => null);
	if (!fh) return null;
	const { size, mtimeMs } = await fh.stat();
	return { path: name, size, mode, mtime: mtimeMs, content: fh.createReadStream({ autoClose: true }) };
}

/** Takes a snapshot now (or joins the one already running). */
export function snapshot(): Promise<Snapshot> {
	if (!BACKUP_DIR) return Promise.reject(new BackupsOffError());
	running ??= takeSnapshot()
		.then((s) => ((lastError = null), s))
		.catch((err) => {
			lastError = err instanceof Error ? err.message : String(err);
			throw err;
		})
		.finally(() => (running = null));
	return running;
}

async function takeSnapshot(): Promise<Snapshot> {
	await mkdir(SNAPSHOTS(), { recursive: true });
	const taken = new Set((await listSnapshots()).map((s) => s.name));
	let name = `saga-${stamp()}.tar.gz`;
	for (let i = 2; taken.has(name); i++) name = `saga-${stamp()}-${i}.tar.gz`;
	const copy = join(DATA_DIR, `.snapshot-${process.pid}.db`);
	const part = join(SNAPSHOTS(), `.${name}.part`);
	await rm(copy, { force: true });
	try {
		// A consistent copy of the database; its file items decide which blobs go in.
		db.prepare('VACUUM INTO ?').run(copy);
		const snap = new DatabaseSync(copy, { readOnly: true });
		const codes = (snap.prepare("SELECT code FROM items WHERE kind = 'file'").all() as { code: string }[]).map((r) => r.code);
		snap.close();

		async function* entries() {
			yield (await fileEntry(copy, 'saga.db'))!;
			const key = await fileEntry(join(DATA_DIR, 'secret.key'), 'secret.key');
			if (key) yield key;
			for (const code of codes) {
				const blob = await fileEntry(join(BLOB_DIR, code), `blobs/${code}`);
				if (blob) yield blob;
			}
		}
		await pipeline(tarGz(entries()), createWriteStream(part, { mode: 0o600 }));
		await rename(part, join(SNAPSHOTS(), name));
	} catch (err) {
		await rm(part, { force: true });
		throw err;
	} finally {
		await rm(copy, { force: true });
	}
	// Keep the newest BACKUP_KEEP.
	const all = await listSnapshots();
	for (const old of all.slice(BACKUP_KEEP)) await rm(join(SNAPSHOTS(), old.name), { force: true });
	console.log(`[saga] backup written: ${name}`);
	return all.find((s) => s.name === name)!;
}

/** Hourly check: a snapshot is due when the newest is older than BACKUP_HOURS (survives restarts). */
export function scheduleBackups() {
	if (!BACKUP_DIR || !BACKUP_HOURS) return;
	const check = async () => {
		const [newest] = await listSnapshots();
		if (!newest || Date.now() - newest.createdAt >= BACKUP_HOURS * 3_600_000 - 60_000) await snapshot();
	};
	const run = () => check().catch((err) => console.error('[saga] backup failed', err));
	setTimeout(run, 60_000).unref();
	setInterval(run, 3_600_000).unref();
}

/** A file or folder name: printable, no slashes, never . or .. */
const safe = (name: string) => (/^\.*$/.test(cleanName(name)) ? 'untitled' : cleanName(name));

/** `name (code).ext`: readable, and re-saving the same item overwrites its copy. */
function withCode(name: string, code: string): string {
	const m = name.match(/^(.+?)(\.[^.]{1,10})?$/)!;
	return `${m[1]} (${code})${m[2] ?? ''}`;
}

async function writeItem(item: Item, path: string) {
	await mkdir(join(path, '..'), { recursive: true });
	const tmp = `${path}.saga-part`;
	await pipeline(contentOf(item), createWriteStream(tmp, { mode: 0o600 }));
	if (item.mode) await chmod(tmp, parseInt(item.mode, 8)).catch(() => {}); // SMB may ignore modes
	await rename(tmp, path);
}

/** An item's name in a saved copy: `name (code).ext`, .txt for text, .enc when encrypted. */
export function savedName(item: Item): string {
	const name = item.kind === 'paste' ? `${safe(item.name || 'paste')}${/\.\w{1,8}$/.test(item.name) ? '' : '.txt'}` : safe(item.name);
	return withCode(name, item.code) + (item.encrypted ? '.enc' : '');
}

/** Where a saved item goes: text/ or files/. */
export const savedFolder = (item: Item) => (item.kind === 'paste' ? 'text' : 'files');

/** Copies one item to saved/text or saved/files. Returns the path, relative to the backup folder. */
export async function saveItem(item: Item): Promise<string> {
	if (!BACKUP_DIR) throw new BackupsOffError();
	const rel = join('saved', savedFolder(item), savedName(item));
	await writeItem(item, join(BACKUP_DIR, rel));
	return rel;
}

/** A collection's folder name in saved copies; re-saving overwrites it, renamed or not. */
export const collectionFolder = (collection: Collection) => withCode(safe(collection.name), collection.code);

/**
 * Writes a collection as a folder tree into `dir` (which must not exist yet): files at their
 * target paths (~/ under home/, / under root/), unplaced ones under unplaced/, plus install.sh.
 */
export async function writeCollectionTree(dir: string, collection: Collection, items: Item[], url: string) {
	await mkdir(dir, { recursive: true });
	const used = new Set<string>();
	for (const item of items) {
		const parts = item.path ? [item.path.startsWith('~/') ? 'home' : 'root', ...item.path.replace(/^~?\/+/, '').split('/')] : ['unplaced', item.name];
		let file = join(dir, ...parts.map(safe)) + (item.encrypted ? '.enc' : '');
		if (used.has(file)) file = join(dir, 'unplaced', withCode(safe(item.name), item.code));
		used.add(file);
		await writeItem(item, file);
	}
	await writeFile(join(dir, 'install.sh'), await installScript(collection, items, url), { mode: 0o700 });
}

export async function saveCollection(collection: Collection, items: Item[], url: string): Promise<string> {
	if (!BACKUP_DIR) throw new BackupsOffError();
	const parent = join(SAVED(), 'collections');
	await mkdir(parent, { recursive: true });
	const rel = join('saved', 'collections', collectionFolder(collection));
	const tmp = join(parent, `.${collection.code}.saga-part`);
	await rm(tmp, { recursive: true, force: true });
	try {
		await writeCollectionTree(tmp, collection, items, url);
		// Move earlier copies aside (the collection may have been renamed), swap in the new one, then drop them.
		const old = join(parent, `.${collection.code}.saga-old`);
		await rm(old, { recursive: true, force: true });
		await mkdir(old);
		for (const name of await readdir(parent)) if (name.endsWith(` (${collection.code})`)) await rename(join(parent, name), join(old, name));
		await rename(tmp, join(BACKUP_DIR, rel));
		await rm(old, { recursive: true, force: true });
	} catch (err) {
		await rm(tmp, { recursive: true, force: true });
		throw err;
	}
	return rel;
}
