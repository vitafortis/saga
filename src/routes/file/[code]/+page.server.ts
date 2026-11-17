import { getCollection } from '#lib/server/collections.ts';
import { findItem } from '#lib/server/lookup.ts';
import { canPreview } from '#lib/server/send.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const item = findItem(event, event.params.code, 'file');
	return { item, collection: item.collection ? getCollection(item.collection) : null, preview: !item.burn && canPreview(item.mime) ? item.mime.split('/')[0] : null };
};
