import { json } from '@sveltejs/kit';
import type { Item } from '#lib/types.ts';

/** Response for a new item: the item and its share link (`curl` users want the link). */
export function created(item: Item, origin: string, request: Request): Response {
	const url = `${origin}/${item.kind}/${item.code}`;
	// curl and friends get the bare link, ready to paste into another terminal.
	if (!request.headers.get('accept')?.includes('application/json')) return new Response(`${url}\n`, { status: 201 });
	return json({ item, url }, { status: 201 });
}
