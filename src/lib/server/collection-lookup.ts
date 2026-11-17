import { error, type RequestEvent } from '@sveltejs/kit';
import { getCollection } from './collections.ts';
import { missLimiter } from './limits.ts';
import type { Collection } from '#lib/types.ts';

/** Like findItem, for collections: unknown codes count against the caller's IP. */
export function findCollection(event: RequestEvent, code: string): Collection {
	const ip = event.locals.ip;
	if (missLimiter.blocked(ip)) error(429, 'Too many unknown codes. Try again in a few minutes.');
	const collection = getCollection(code);
	if (!collection) {
		missLimiter.hit(ip);
		error(404, 'Nothing here. The code may be wrong, or the collection was deleted.');
	}
	return collection;
}
