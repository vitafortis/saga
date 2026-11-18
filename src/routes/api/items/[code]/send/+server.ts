import { error, json } from '@sveltejs/kit';
import { CloudError, CloudOffError, sendItem } from '#lib/server/cloud.ts';
import { findItem, requireAuth } from '#lib/server/lookup.ts';
import type { RequestHandler } from './$types';

/** Sends the item to Google Drive (SAGA_CLOUD_REMOTE): `{ path }`. */
export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const item = findItem(event, event.params.code);
	// A copy would outlive the one open it's meant to have.
	if (item.burn) error(409, 'Delete-after-first-open items aren’t sent anywhere');
	try {
		return json({ path: await sendItem(item) }, { status: 201 });
	} catch (err) {
		if (err instanceof CloudOffError) error(409, err.message);
		if (err instanceof CloudError) error(502, err.message);
		throw err;
	}
};
