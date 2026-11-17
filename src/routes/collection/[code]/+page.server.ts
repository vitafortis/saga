import { findCollection } from '#lib/server/collection-lookup.ts';
import { collectionItems } from '#lib/server/collections.ts';
import { listItems } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const collection = findCollection(event, event.params.code);
	// Shared items that can be copied in ("Add existing"); burn items can't, as copying would open them.
	const shared = event.locals.authed ? listItems().filter((i) => !i.burn) : [];
	return { collection, items: collectionItems(collection.code), shared };
};
