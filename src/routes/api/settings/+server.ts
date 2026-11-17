import { error, json } from '@sveltejs/kit';
import { requireAuth } from '#lib/server/lookup.ts';
import { getSettings, saveSettings } from '#lib/server/settings.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => {
	requireAuth(event);
	return json(getSettings());
};

export const PUT: RequestHandler = async (event) => {
	requireAuth(event);
	const body = await event.request.json().catch(() => null);
	if (!body || typeof body !== 'object') error(400, 'Expected JSON');
	const problem = saveSettings(body as Record<string, unknown>);
	if (problem) error(400, problem);
	return json(getSettings());
};
