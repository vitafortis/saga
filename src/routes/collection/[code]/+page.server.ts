import { findCollection } from '#lib/server/collection-lookup.ts';
import { collectionItems } from '#lib/server/collections.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const collection = findCollection(event, event.params.code);
	return { collection, items: collectionItems(collection.code) };
};
