import { findItem } from '#lib/server/lookup.ts';
import { countView, getPasteContent } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const item = findItem(event, event.params.code, 'paste');
	// Burn-after-read pastes are revealed with a POST (see /api/items/[code]/open), never on load.
	if (item.burn) return { item, content: null };
	countView(item.code);
	return { item, content: getPasteContent(item.code) ?? '' };
};
