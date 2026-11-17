import { error, json } from '@sveltejs/kit';
import { deleteCollection, getCollection, updateCollection } from '#lib/server/collections.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async (event) => {
	requireAuth(event);
	if (!getCollection(event.params.code)) error(404, 'Not found');
	const body = (await event.request.json().catch(() => ({}))) as { name?: unknown; description?: unknown };
	return json(
		updateCollection(event.params.code, {
			name: typeof body.name === 'string' ? body.name : undefined,
			description: typeof body.description === 'string' ? body.description : undefined
		})
	);
};

export const DELETE: RequestHandler = async (event) => {
	requireAuth(event);
	if (!(await deleteCollection(event.params.code))) error(404, 'Not found');
	return json({ ok: true });
};
