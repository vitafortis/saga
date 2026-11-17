import { error } from '@sveltejs/kit';
import { archive } from '#lib/server/bundle.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import { contentDisposition, pasteFileName } from '#lib/server/send.ts';
import { getItem } from '#lib/server/store.ts';
import type { Item } from '#lib/types.ts';
import type { RequestHandler } from './$types';

/** In the archive, text gets a .txt name; encrypted items keep their ciphertext and end in .enc. */
const nameOf = (item: Item) => (item.kind === 'paste' ? pasteFileName({ ...item, encrypted: false }) : item.name) + (item.encrypted ? '.enc' : '');

/** Several items as one .tar.gz: `?codes=12345678,23456789` (the Recent checkboxes). */
export const GET: RequestHandler = (event) => {
	requireAuth(event);
	const codes = [...new Set((event.url.searchParams.get('codes') ?? '').split(',').filter(Boolean))];
	if (!codes.length) error(400, 'Pick at least one item');
	if (codes.length > 200) error(400, 'Too many items at once (200 at most)');
	const items = codes.map((code) => {
		const item = getItem(code);
		if (!item) error(404, `${code} not found. It may have expired or been deleted.`);
		// Downloading would use up its one open, and the archive is easy to fetch twice by accident.
		if (item.burn) error(400, `“${item.name || code}” is deleted after first open, so it can only be downloaded on its own`);
		return item;
	});
	const stamp = new Date().toISOString().slice(0, 10);
	return new Response(archive(items, nameOf), {
		headers: {
			'content-type': 'application/gzip',
			'content-disposition': contentDisposition('attachment', `saga-${stamp}.tar.gz`),
			'cache-control': 'private, no-store'
		}
	});
};
