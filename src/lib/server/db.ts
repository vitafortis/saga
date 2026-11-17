import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { DATA_DIR } from './config.ts';

export const db = new DatabaseSync(join(DATA_DIR, 'saga.db'));
db.exec(`
	PRAGMA journal_mode = WAL;
	PRAGMA busy_timeout = 5000;
	CREATE TABLE IF NOT EXISTS items (
		code TEXT PRIMARY KEY,
		kind TEXT NOT NULL CHECK (kind IN ('paste', 'file')),
		name TEXT NOT NULL DEFAULT '',
		mime TEXT NOT NULL,
		size INTEGER NOT NULL,
		content TEXT,
		created_at INTEGER NOT NULL,
		expires_at INTEGER,
		burn INTEGER NOT NULL DEFAULT 0,
		views INTEGER NOT NULL DEFAULT 0
	);
	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS items_expires ON items (expires_at) WHERE expires_at IS NOT NULL;
`);
