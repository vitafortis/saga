import { json } from '@sveltejs/kit';
import { getCollection } from '#lib/server/collections.ts';
import { findItem } from '#lib/server/lookup.ts';
import type { RequestHandler } from './$types';

/** What a code is: `{ kind: 'paste' | 'file' | 'collection', code, name, burn?, encrypted? }`. */
export const GET: RequestHandler = (event) => {
	const code = event.params.code.replace(/[\s-]/g, '');
	const collection = getCollection(code);
	if (collection) return json({ kind: 'collection', code, name: collection.name });
	const item = findItem(event, code);
	return json({ kind: item.kind, code, name: item.name, burn: item.burn, encrypted: item.encrypted });
};
