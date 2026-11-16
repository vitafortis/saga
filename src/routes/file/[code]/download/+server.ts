import { error } from '@sveltejs/kit';
import { findItem } from '#lib/server/lookup.ts';
import { sendFile } from '#lib/server/send.ts';
import { claim, countView } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

function send(event: Parameters<RequestHandler>[0]) {
	const item = findItem(event, event.params.code, 'file');
	const { request, url } = event;
	if (item.burn) {
		// GETs come from link previews and prefetchers too; a burn item opens only on purpose.
		if (request.method !== 'POST') error(403, 'This file is deleted once downloaded. Download it from its page, or with curl -X POST.');
		if (!claim(item.code)) error(404, 'Nothing here.');
		return sendFile(item, request, { inline: false, burn: true });
	}
	const inline = url.searchParams.has('inline');
	// Previews fetch in ranges; count whole downloads only.
	if (!inline && !request.headers.has('range') && request.method !== 'HEAD') countView(item.code);
	return sendFile(item, request, { inline });
}

export const GET: RequestHandler = send;
export const HEAD: RequestHandler = send;
export const POST: RequestHandler = send;
