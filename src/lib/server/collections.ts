import { db } from './db.ts';
import { deleteItem, getItem, isCode, newCode } from './store.ts';
import type { Collection, Item } from '#lib/types.ts';

type Row = { code: string; name: string; description: string; created_at: number; updated_at: number; count: number; size: number };

const SELECT = `
	SELECT c.code, c.name, c.description, c.created_at, c.updated_at,
		COUNT(i.code) AS count, COALESCE(SUM(i.size), 0) AS size
	FROM collections c LEFT JOIN items i ON i.collection = c.code`;

const toCollection = (r: Row): Collection => ({
	code: r.code,
	name: r.name,
	description: r.description,
	createdAt: r.created_at,
	updatedAt: r.updated_at,
	count: Number(r.count),
	size: Number(r.size)
});

export function createCollection(name: string, description = ''): Collection {
	const code = newCode();
	const now = Date.now();
	db.prepare('INSERT INTO collections (code, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
		code,
		name.trim().slice(0, 200) || 'Untitled collection',
		description.trim().slice(0, 2000),
		now,
		now
	);
	return getCollection(code)!;
}

export function getCollection(code: string): Collection | null {
	if (!isCode(code)) return null;
	const row = db.prepare(`${SELECT} WHERE c.code = ? GROUP BY c.code`).get(code) as Row | undefined;
	return row ? toCollection(row) : null;
}

export function listCollections(): Collection[] {
	return (db.prepare(`${SELECT} GROUP BY c.code ORDER BY c.updated_at DESC`).all() as Row[]).map(toCollection);
}

export function updateCollection(code: string, changes: { name?: string; description?: string }): Collection | null {
	if (changes.name !== undefined) db.prepare('UPDATE collections SET name = ? WHERE code = ?').run(changes.name.trim().slice(0, 200) || 'Untitled collection', code);
	if (changes.description !== undefined) db.prepare('UPDATE collections SET description = ? WHERE code = ?').run(changes.description.trim().slice(0, 2000), code);
	db.prepare('UPDATE collections SET updated_at = ? WHERE code = ?').run(Date.now(), code);
	return getCollection(code);
}

export async function deleteCollection(code: string): Promise<boolean> {
	const items = db.prepare('SELECT code FROM items WHERE collection = ?').all(code) as { code: string }[];
	for (const { code: item } of items) await deleteItem(item);
	return Number(db.prepare('DELETE FROM collections WHERE code = ?').run(code).changes) > 0;
}

/** The collection's files, ordered by target path (unplaced ones last), then name. */
export function collectionItems(code: string): Item[] {
	const rows = db
		.prepare(
			`SELECT code FROM items WHERE collection = ? ORDER BY path IS NULL, path COLLATE NOCASE, name COLLATE NOCASE`
		)
		.all(code) as { code: string }[];
	return rows.map((r) => getItem(r.code)).filter((i): i is Item => i !== null);
}
