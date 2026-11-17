import { listCollections } from '#lib/server/collections.ts';
import { listItems } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	items: locals.authed ? listItems() : [],
	collections: locals.authed ? listCollections() : []
});
