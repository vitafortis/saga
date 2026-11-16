import { error } from '@sveltejs/kit';
import { findItem } from '#lib/server/lookup.ts';
import { pasteFileName, sendText } from '#lib/server/send.ts';
import { claim, countView, getPasteContent } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

function send(event: Parameters<RequestHandler>[0]) {
	const item = findItem(event, event.params.code, 'paste');
	const content = getPasteContent(item.code) ?? '';
	if (item.burn) {
		// GETs come from link previews and prefetchers too; a burn item opens only on purpose.
		if (event.request.method !== 'POST') error(403, 'This paste is deleted once read. Open it with POST (curl -X POST).');
		if (!claim(item.code)) error(404, 'Nothing here.');
	} else countView(item.code);
	return sendText(content, pasteFileName(item), event.url.searchParams.has('download'));
}

export const GET: RequestHandler = send;
export const POST: RequestHandler = send;
