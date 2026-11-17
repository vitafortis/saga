import { redirect } from '@sveltejs/kit';
import { getCollection } from '#lib/server/collections.ts';
import { findItem } from '#lib/server/lookup.ts';
import type { PageServerLoad } from './$types';

/** /12345678 (or "1234 5678" typed into the box) goes to the paste, file or collection. */
export const load: PageServerLoad = (event) => {
	const code = event.params.code.replace(/[\s-]/g, '');
	if (getCollection(code)) redirect(303, `/collection/${code}`);
	const item = findItem(event, code);
	redirect(303, `/${item.kind}/${item.code}`);
};
