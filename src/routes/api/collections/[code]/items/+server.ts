import { error, json } from '@sveltejs/kit';
import { getCollection } from '#lib/server/collections.ts';
import { MAX_FILE_BYTES, MAX_PASTE_BYTES } from '#lib/server/config.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import { cleanMode, cleanPath, createFile, createPaste, TooLargeError } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

function placement(path: unknown, mode: unknown) {
	const p = cleanPath(typeof path === 'string' ? path : null);
	const m = cleanMode(typeof mode === 'string' ? mode : null);
	if (p instanceof Error) error(400, p.message);
	if (m instanceof Error) error(400, m.message);
	return { path: p, mode: m };
}

/** A text file: JSON `{ name, content, path?, mode? }`. */
export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const collection = event.params.code;
	if (!getCollection(collection)) error(404, 'Not found');
	const body = (await event.request.json().catch(() => null)) as { name?: unknown; content?: unknown; path?: unknown; mode?: unknown } | null;
	if (!body || typeof body.content !== 'string') error(400, 'content is required');
	if (Buffer.byteLength(body.content) > MAX_PASTE_BYTES) error(413, 'Too large for a text file; upload it instead');
	const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'untitled.txt';
	return json(createPaste(body.content, name, { collection, ...placement(body.path, body.mode) }), { status: 201 });
};

/** A file as the raw body; `?name=&path=&mode=`. */
export const PUT: RequestHandler = async (event) => {
	requireAuth(event);
	const { request, url } = event;
	const collection = event.params.code;
	if (!getCollection(collection)) error(404, 'Not found');
	if (!request.body) error(400, 'No file');
	if (Number(request.headers.get('content-length')) > MAX_FILE_BYTES) error(413, 'File too large');
	const where = placement(url.searchParams.get('path'), url.searchParams.get('mode'));
	const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	try {
		const item = await createFile(request.body, url.searchParams.get('name') ?? 'file', /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : '', { collection, ...where });
		return json(item, { status: 201 });
	} catch (err) {
		if (err instanceof TooLargeError) error(413, err.message);
		throw err;
	}
};
