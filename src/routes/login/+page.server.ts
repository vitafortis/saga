import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.authed) redirect(303, '/');
	const next = url.searchParams.get('next');
	return { next: next?.startsWith('/') && !next.startsWith('//') ? next : '/' };
};
