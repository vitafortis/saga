import { error } from '@sveltejs/kit';
import { MAX_FILE_BYTES } from '#lib/server/config.ts';
import { created } from '#lib/server/created.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import { isExpiry } from '#lib/types.ts';
import { burnParam } from '#lib/server/settings.ts';
import { createFile, TooLargeError } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/**
 * The raw file as the body, streamed to disk (no multipart, nothing held in memory).
 * Name and options in the query: `curl -T photo.jpg '…/api/files?expiry=1d'` (curl adds the name).
 */
const upload: RequestHandler = async (event) => {
	requireAuth(event);
	const { request, url } = event;
	if (!request.body) error(400, 'No file');
	if (Number(request.headers.get('content-length')) > MAX_FILE_BYTES) error(413, `Files can be up to ${Math.round(MAX_FILE_BYTES / 1048576)} MB`);
	const expiry = url.searchParams.get('expiry');
	if (expiry && !isExpiry(expiry)) error(400, 'expiry is one of 10m, 1h, 1d, 7d, 30d, never');
	const name = url.searchParams.get('name') || decodeURIComponent(url.pathname.split('/').pop() || '');
	const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	try {
		const item = await createFile(request.body, name, /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : '', {
			expiry,
			burn: burnParam(url.searchParams.get('burn'))
		});
		return created(item, event.locals.origin, request);
	} catch (err) {
		if (err instanceof TooLargeError) error(413, err.message);
		throw err;
	}
};

export const PUT = upload;
export const POST = upload;
