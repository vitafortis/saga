import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';

const env = process.env;

export const DATA_DIR = resolve(env.SAGA_DATA_DIR || './data');
export const BLOB_DIR = join(DATA_DIR, 'blobs');
mkdirSync(BLOB_DIR, { recursive: true });

/** Password for creating and managing items. Unset: anyone who can reach the app can. */
export const PASSWORD = env.SAGA_PASSWORD || '';
/** Optional token for scripts: `Authorization: Bearer <token>`. */
export const API_TOKEN = env.SAGA_API_TOKEN || '';

const mb = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d) * 1024 * 1024;
export const MAX_FILE_BYTES = mb(env.SAGA_MAX_FILE_MB, 1024);
export const MAX_PASTE_BYTES = mb(env.SAGA_MAX_PASTE_MB, 10);

/**
 * Backups and "Save to NAS" go here: a NAS share mounted into the container (see compose.yaml).
 * Unset: both are off.
 */
export const BACKUP_DIR = env.SAGA_BACKUP_DIR ? resolve(env.SAGA_BACKUP_DIR) : '';
/** Hours between scheduled snapshots; 0 for manual only. */
export const BACKUP_HOURS = Math.max(0, Number(env.SAGA_BACKUP_HOURS ?? 24) || 0);
/** Snapshots kept; older ones are removed. */
export const BACKUP_KEEP = Math.max(1, Number(env.SAGA_BACKUP_KEEP) || 14);

/** Digits in new shortcodes. */
/** An rclone remote and folder for Send to cloud, like `gdrive:Saga`; unset means off. */
export const CLOUD_REMOTE = (env.SAGA_CLOUD_REMOTE ?? '').trim().replace(/\/+$/, '');
/** What the button calls it: "Send to Google Drive". */
export const CLOUD_NAME = (env.SAGA_CLOUD_NAME ?? '').trim() || 'Google Drive';
/** The rclone binary (the image includes one). */
export const RCLONE = env.SAGA_RCLONE || 'rclone';

export const CODE_LENGTH = Math.min(12, Math.max(6, Number(env.SAGA_CODE_LENGTH) || 8));

if (!PASSWORD) console.warn('[saga] SAGA_PASSWORD is not set, so there is no sign-in: anyone who can reach Saga can share. Fine behind SSO; otherwise set it.');

/** Signs session cookies. SAGA_SECRET, or a random key kept in the data folder. */
export const SECRET: Buffer = (() => {
	if (env.SAGA_SECRET) return Buffer.from(env.SAGA_SECRET);
	const file = join(DATA_DIR, 'secret.key');
	if (existsSync(file)) return readFileSync(file);
	const key = randomBytes(32);
	writeFileSync(file, key, { mode: 0o600 });
	return key;
})();
