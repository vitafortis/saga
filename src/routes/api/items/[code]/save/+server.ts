import { error, json } from '@sveltejs/kit';
import { BackupsOffError, saveItem } from '#lib/server/backup.ts';
import { findItem, requireAuth } from '#lib/server/lookup.ts';
import type { RequestHandler } from './$types';

/** Copies the item to the NAS folder: `{ path }`, relative to it. */
export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const item = findItem(event, event.params.code);
	// A saved copy would outlive the one open it's meant to have.
	if (item.burn) error(409, 'Delete-after-first-open items aren’t saved');
	try {
		return json({ path: await saveItem(item) }, { status: 201 });
	} catch (err) {
		if (err instanceof BackupsOffError) error(409, err.message);
		throw err;
	}
};
