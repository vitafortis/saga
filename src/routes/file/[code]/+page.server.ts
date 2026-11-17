import { getCollection } from '#lib/server/collections.ts';
import { findItem } from '#lib/server/lookup.ts';
import { canPreview, textPreview } from '#lib/server/send.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const item = findItem(event, event.params.code, 'file');
	// Burn files would be used up by a preview, and encrypted ones are only bytes to the server.
	const open = !item.burn && !item.encrypted;
	const media = open && canPreview(item.mime);
	const preview = media ? (item.mime === 'application/pdf' ? 'pdf' : item.mime.split('/')[0]) : null;
	return {
		item,
		collection: item.collection ? getCollection(item.collection) : null,
		preview,
		text: open && !media ? await textPreview(item) : null
	};
};
