import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { contentOf } from './bundle.ts';
import { collectionFolder, savedFolder, savedName, writeCollectionTree } from './backup.ts';
import { CLOUD_NAME, CLOUD_REMOTE, DATA_DIR, RCLONE } from './config.ts';
import type { Collection, Item } from '#lib/types.ts';

/**
 * Send to Google Drive (or any rclone remote): the same layout as Save to NAS, under
 * SAGA_CLOUD_REMOTE. rclone does the talking to the cloud, with the config and sign-in made by
 * `rclone config` (see readme.md). Encrypted items stay encrypted.
 */

export class CloudOffError extends Error {
	constructor() {
		super(`Sending to ${CLOUD_NAME} is off: set SAGA_CLOUD_REMOTE and mount an rclone config (see compose.yaml)`);
	}
}

export class CloudError extends Error {}

/** Runs rclone, feeding it `input` if given. Rejects with its last error line. */
function rclone(args: string[], input?: AsyncIterable<Buffer>): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(RCLONE, args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
		let out = '';
		let err = '';
		child.stdout!.on('data', (d) => (out += d));
		child.stderr!.on('data', (d) => (err += d));
		child.on('error', (e) => reject(new CloudError(`rclone isn't available (${e.message})`)));
		child.on('close', (code) => {
			if (code === 0) return resolve(out);
			const line = err.trim().split('\n').filter(Boolean).pop() ?? `exit ${code}`;
			// "2026/11/18 10:00:00 ERROR : …" → just the message.
			const msg = line.replace(/^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d \w+\s*:\s*/, '');
			const signIn = /token|oauth|invalid_grant|unauthor/i.test(err) ? ` The ${CLOUD_NAME} sign-in may have expired: run rclone config reconnect on the config Saga uses.` : '';
			reject(new CloudError(`${CLOUD_NAME} refused it: ${msg}.${signIn}`));
		});
		if (input && child.stdin) pipeline(Readable.from(input), child.stdin).catch(() => {}); // rclone's own exit reports the error
	});
}

const dest = (...parts: string[]) => [CLOUD_REMOTE, ...parts].join('/');

/** Sends one item to <remote>/text or /files. Returns where, for the toast. */
export async function sendItem(item: Item): Promise<string> {
	if (!CLOUD_REMOTE) throw new CloudOffError();
	const path = dest(savedFolder(item), savedName(item));
	await rclone(['rcat', path], contentOf(item));
	return path;
}

/** Sends a collection's folder tree to <remote>/collections/<name (code)>, replacing earlier copies. */
export async function sendCollection(collection: Collection, items: Item[], url: string): Promise<string> {
	if (!CLOUD_REMOTE) throw new CloudOffError();
	const tmp = await mkdtemp(join(DATA_DIR, '.cloud-'));
	try {
		const tree = join(tmp, 'tree');
		await writeCollectionTree(tree, collection, items, url);
		const folder = collectionFolder(collection);
		const path = dest('collections', folder);
		// sync, not copy: files removed from the collection go from the cloud copy too.
		await rclone(['sync', tree, path]);
		// Copies under an old name (the collection was renamed since).
		const dirs = await rclone(['lsf', '--dirs-only', dest('collections')]).catch(() => '');
		for (const d of dirs.split('\n').map((l) => l.replace(/\/$/, ''))) {
			if (d && d !== folder && d.endsWith(` (${collection.code})`)) await rclone(['purge', dest('collections', d)]).catch(() => {});
		}
		return path;
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
}
