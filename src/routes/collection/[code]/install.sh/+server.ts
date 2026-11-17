import { installScript } from '#lib/server/bundle.ts';
import { findCollection } from '#lib/server/collection-lookup.ts';
import { collectionItems } from '#lib/server/collections.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const collection = findCollection(event, event.params.code);
	const url = `${event.locals.origin}/collection/${collection.code}/install.sh`;
	return new Response(await installScript(collection, collectionItems(collection.code), url), {
		headers: {
			'content-type': 'text/x-shellscript; charset=utf-8',
			'content-disposition': `inline; filename="saga-${collection.code}.sh"`,
			'content-security-policy': "default-src 'none'; sandbox",
			'cache-control': 'private, no-store'
		}
	});
};
