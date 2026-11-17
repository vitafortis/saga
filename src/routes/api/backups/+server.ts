import { error, json } from '@sveltejs/kit';
import { backupStatus, BackupsOffError, snapshot } from '#lib/server/backup.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	return json(await backupStatus());
};

/** Takes a snapshot now; responds once it's written. */
export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	try {
		return json(await snapshot(), { status: 201 });
	} catch (err) {
		if (err instanceof BackupsOffError) error(409, err.message);
		error(500, `Backup failed: ${err instanceof Error ? err.message : err}`);
	}
};
