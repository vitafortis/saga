import { redirect } from '@sveltejs/kit';
import { findItem } from '#lib/server/lookup.ts';
import type { PageServerLoad } from './$types';

/** /12345678 (or "1234 5678" typed into the box) goes to the paste or file. */
export const load: PageServerLoad = (event) => {
	const item = findItem(event, event.params.code.replace(/[\s-]/g, ''));
	redirect(303, `/${item.kind}/${item.code}`);
};
