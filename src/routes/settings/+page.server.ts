import { redirect } from '@sveltejs/kit';
import { usage } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.authed) redirect(303, '/login?next=/settings');
	return { usage: usage() };
};
