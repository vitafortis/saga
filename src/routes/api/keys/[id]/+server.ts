import { error, json } from '@sveltejs/kit';
import { revokeKey } from '#lib/server/api-keys.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = (event) => {
	requireAuth(event);
	if (!revokeKey(event.params.id)) error(404, 'Not found');
	return json({ ok: true });
};
