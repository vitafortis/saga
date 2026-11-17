import { redirect } from '@sveltejs/kit';
import { listKeys } from '#lib/server/api-keys.ts';
import { backupStatus } from '#lib/server/backup.ts';
import { usage } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.authed) redirect(303, '/login?next=/settings');
	return { usage: usage(), keys: listKeys(), backups: await backupStatus() };
};
