import { error } from '@sveltejs/kit';
import { MAX_PASTE_BYTES } from '#lib/server/config.ts';
import { created } from '#lib/server/created.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import { burnParam } from '#lib/server/settings.ts';
import { createPaste } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/**
 * JSON `{ content, title?, expiry?, burn? }` from the app, or a raw text body from scripts
 * (`curl --data-binary @notes.txt '…/api/pastes?expiry=1h'`), with options in the query.
 */
export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const { request, url } = event;
	const length = Number(request.headers.get('content-length'));
	if (length > MAX_PASTE_BYTES * 1.1) error(413, 'Paste too large');

	let content: string;
	let title = url.searchParams.get('title') ?? '';
	let expiry = url.searchParams.get('expiry');
	let burn = burnParam(url.searchParams.get('burn'));
	if (request.headers.get('content-type')?.includes('application/json')) {
		const body = (await request.json().catch(() => null)) as { content?: unknown; title?: unknown; expiry?: unknown; burn?: unknown } | null;
		if (!body || typeof body.content !== 'string') error(400, 'content is required');
		content = body.content;
		if (typeof body.title === 'string') title = body.title;
		if (typeof body.expiry === 'string') expiry = body.expiry;
		if (typeof body.burn === 'boolean') burn = body.burn;
	} else {
		content = await request.text();
	}
	if (!content.trim()) error(400, 'The paste is empty');
	if (Buffer.byteLength(content) > MAX_PASTE_BYTES) error(413, `Pastes can be up to ${Math.round(MAX_PASTE_BYTES / 1048576)} MB`);
	return created(createPaste(content, title.trim(), { expiry, burn }), event.locals.origin, request);
};
