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

// Collections: named sets of files for setting up machines. Their items carry the
// collection's code and an optional target path and mode; they never expire.
db.exec(`
	CREATE TABLE IF NOT EXISTS collections (
		code TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
`);
const columns = new Set((db.prepare('PRAGMA table_info(items)').all() as { name: string }[]).map((c) => c.name));
for (const [name, type] of [
	['collection', 'TEXT'],
	['path', 'TEXT'],
	['mode', 'TEXT'],
	['encrypted', 'INTEGER NOT NULL DEFAULT 0']
]) {
	if (!columns.has(name)) db.exec(`ALTER TABLE items ADD COLUMN ${name} ${type}`);
}
db.exec('CREATE INDEX IF NOT EXISTS items_collection ON items (collection) WHERE collection IS NOT NULL');

// API keys for /api/v1 (scripts, sagacp). Only a SHA-256 of each key is kept.
db.exec(`
	CREATE TABLE IF NOT EXISTS api_keys (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		hash TEXT NOT NULL UNIQUE,
		prefix TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		last_used_at INTEGER
	);
`);
