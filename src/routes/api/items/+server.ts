import { json } from '@sveltejs/kit';
import { requireAuth } from '#lib/server/lookup.ts';
import { listItems } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => {
	requireAuth(event);
	return json(listItems());
};
