import { json } from '@sveltejs/kit';
import { createKey, listKeys } from '#lib/server/api-keys.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import type { RequestHandler } from './$types';

// Not under /api/v1: a key can't be used to make more keys.
export const GET: RequestHandler = (event) => {
	requireAuth(event);
	return json(listKeys());
};

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const { name } = (await event.request.json().catch(() => ({}))) as { name?: unknown };
	return json(createKey(typeof name === 'string' ? name : ''), { status: 201 });
};
