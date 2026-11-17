import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { API_TOKEN } from './config.ts';
import { db } from './db.ts';
import type { ApiKey } from '#lib/types.ts';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

type Row = { id: string; name: string; prefix: string; created_at: number; last_used_at: number | null };
const toKey = (r: Row): ApiKey => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: r.created_at, lastUsedAt: r.last_used_at });

/** A new key; the secret is returned this once and never stored. */
export function createKey(name: string): { key: ApiKey; secret: string } {
	const secret = `saga_${randomBytes(24).toString('base64url')}`;
	const id = randomUUID();
	db.prepare('INSERT INTO api_keys (id, name, hash, prefix, created_at) VALUES (?, ?, ?, ?, ?)').run(
		id,
		name.trim().slice(0, 100) || 'API key',
		sha256(secret),
		secret.slice(0, 9),
		Date.now()
	);
	return { key: listKeys().find((k) => k.id === id)!, secret };
}

export function listKeys(): ApiKey[] {
	return (db.prepare('SELECT id, name, prefix, created_at, last_used_at FROM api_keys ORDER BY created_at DESC').all() as Row[]).map(toKey);
}

export function revokeKey(id: string): boolean {
	return Number(db.prepare('DELETE FROM api_keys WHERE id = ?').run(id).changes) > 0;
}

/** Whether `secret` is a live key (or SAGA_API_TOKEN). Records when a stored key was last used. */
export function checkKey(secret: string): boolean {
	if (API_TOKEN) {
		const a = Buffer.from(sha256(secret));
		const b = Buffer.from(sha256(API_TOKEN));
		if (timingSafeEqual(a, b)) return true;
	}
	const hash = sha256(secret);
	const row = db.prepare('SELECT id, last_used_at FROM api_keys WHERE hash = ?').get(hash) as { id: string; last_used_at: number | null } | undefined;
	if (!row) return false;
	// At most one write a minute per key.
	if (!row.last_used_at || Date.now() - row.last_used_at > 60_000) db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(Date.now(), row.id);
	return true;
}

/** The key from `Authorization: Bearer <key>` (or `X-Api-Key`). */
export function bearer(headers: Headers): string | null {
	return headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? headers.get('x-api-key') ?? null;
}
