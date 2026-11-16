import { error, json } from '@sveltejs/kit';
import { findItem } from '#lib/server/lookup.ts';
import { claim, countView, getPasteContent } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Reveals a paste. A burn-after-read paste is deleted as it's returned. */
export const POST: RequestHandler = async (event) => {
	const item = findItem(event, event.params.code, 'paste');
	const content = getPasteContent(item.code) ?? '';
	if (item.burn) {
		if (!claim(item.code)) error(404, 'Someone opened this first; it has been deleted.');
	} else countView(item.code);
	return json({ content });
};
