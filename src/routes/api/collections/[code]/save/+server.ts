import { error, json } from '@sveltejs/kit';
import { BackupsOffError, saveCollection } from '#lib/server/backup.ts';
import { findCollection } from '#lib/server/collection-lookup.ts';
import { collectionItems } from '#lib/server/collections.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import type { RequestHandler } from './$types';

/** Mirrors the collection to the NAS folder as plain files: `{ path }`, relative to it. */
export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const collection = findCollection(event, event.params.code);
	try {
		const url = `${event.locals.origin}/api/v1/collections/${collection.code}/install.sh`;
		return json({ path: await saveCollection(collection, collectionItems(collection.code), url) }, { status: 201 });
	} catch (err) {
		if (err instanceof BackupsOffError) error(409, err.message);
		throw err;
	}
};
