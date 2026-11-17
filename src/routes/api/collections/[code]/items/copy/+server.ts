import { error, json } from '@sveltejs/kit';
import { getCollection } from '#lib/server/collections.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import { BurnError, copyToCollection, NotFoundError } from '#lib/server/store.ts';
import type { Item } from '#lib/types.ts';
import type { RequestHandler } from './$types';

/** Copies shared items in: `{ codes: ["12345678", …] }`. The originals are left as they are. */
export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const collection = event.params.code;
	if (!getCollection(collection)) error(404, 'Collection not found');
	const body = (await event.request.json().catch(() => null)) as { codes?: unknown } | null;
	const codes = Array.isArray(body?.codes) ? [...new Set(body.codes.filter((c): c is string => typeof c === 'string'))] : [];
	if (!codes.length) error(400, 'codes is required: the items to copy in');
	const added: Item[] = [];
	for (const code of codes) {
		try {
			added.push(await copyToCollection(code, collection));
		} catch (err) {
			const done = added.length ? ` (${added.length} copied before it)` : '';
			if (err instanceof NotFoundError) error(404, err.message + done);
			if (err instanceof BurnError) error(400, err.message + done);
			throw err;
		}
	}
	return json({ items: added }, { status: 201 });
};
