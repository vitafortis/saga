import { json } from '@sveltejs/kit';
import { createCollection, listCollections } from '#lib/server/collections.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => {
	requireAuth(event);
	return json(listCollections());
};

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const body = (await event.request.json().catch(() => ({}))) as { name?: unknown; description?: unknown };
	const collection = createCollection(typeof body.name === 'string' ? body.name : '', typeof body.description === 'string' ? body.description : '');
	return json({ collection, url: `${event.locals.origin}/collection/${collection.code}` }, { status: 201 });
};
