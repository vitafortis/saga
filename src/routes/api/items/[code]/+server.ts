import { error, json } from '@sveltejs/kit';
import { requireAuth } from '#lib/server/lookup.ts';
import { deleteItem } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async (event) => {
	requireAuth(event);
	if (!(await deleteItem(event.params.code))) error(404, 'Not found');
	return json({ ok: true });
};
