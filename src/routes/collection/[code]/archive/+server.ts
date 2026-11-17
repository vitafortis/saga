import { archive } from '#lib/server/bundle.ts';
import { findCollection } from '#lib/server/collection-lookup.ts';
import { collectionItems } from '#lib/server/collections.ts';
import { contentDisposition } from '#lib/server/send.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => {
	const collection = findCollection(event, event.params.code);
	const slug = collection.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || collection.code;
	return new Response(archive(collectionItems(collection.code)), {
		headers: {
			'content-type': 'application/gzip',
			'content-disposition': contentDisposition('attachment', `${slug}.tar.gz`),
			'cache-control': 'private, no-store'
		}
	});
};
