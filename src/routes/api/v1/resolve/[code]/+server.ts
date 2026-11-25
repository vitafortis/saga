import { json } from '@sveltejs/kit';
import { getCollection } from '#lib/server/collections.ts';
import { findItem } from '#lib/server/lookup.ts';
import type { RequestHandler } from './$types';

/**
 * What a code is, for sagacp: `{ kind: 'paste' | 'file', code, name, size, mime, createdAt,
 * expiresAt, views, burn, encrypted }`, or `{ kind: 'collection', code, name, count, size, updatedAt }`.
 * Looking doesn't open it, so a burn item survives.
 */
export const GET: RequestHandler = (event) => {
	const code = event.params.code.replace(/[\s-]/g, '');
	const c = getCollection(code);
	if (c) return json({ kind: 'collection', code, name: c.name, count: c.count, size: c.size, updatedAt: c.updatedAt });
	const i = findItem(event, code);
	return json({
		kind: i.kind,
		code,
		name: i.name,
		size: i.size,
		mime: i.mime,
		createdAt: i.createdAt,
		expiresAt: i.expiresAt,
		views: i.views,
		burn: i.burn,
		encrypted: i.encrypted
	});
};
