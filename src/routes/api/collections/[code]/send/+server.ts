import { error, json } from '@sveltejs/kit';
import { CloudError, CloudOffError, sendCollection } from '#lib/server/cloud.ts';
import { findCollection } from '#lib/server/collection-lookup.ts';
import { collectionItems } from '#lib/server/collections.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import type { RequestHandler } from './$types';

/** Sends the collection to Google Drive (SAGA_CLOUD_REMOTE) as a folder of plain files: `{ path }`. */
export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const collection = findCollection(event, event.params.code);
	try {
		const url = `${event.locals.origin}/api/v1/collections/${collection.code}/install.sh`;
		return json({ path: await sendCollection(collection, collectionItems(collection.code), url) }, { status: 201 });
	} catch (err) {
		if (err instanceof CloudOffError) error(409, err.message);
		if (err instanceof CloudError) error(502, err.message);
		throw err;
	}
};
