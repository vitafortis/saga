import { error, type RequestEvent } from '@sveltejs/kit';
import { missLimiter } from './limits.ts';
import { getItem } from './store.ts';
import type { Item, ItemKind } from '#lib/types.ts';

/** The item for a public code route, counting misses against the caller's IP. */
export function findItem(event: RequestEvent, code: string, kind?: ItemKind): Item {
	const ip = event.locals.ip;
	if (missLimiter.blocked(ip)) error(429, 'Too many unknown codes. Try again in a few minutes.');
	const item = getItem(code);
	if (!item || (kind && item.kind !== kind)) {
		missLimiter.hit(ip);
		error(404, 'Nothing here. The code may be wrong, or the item expired or was deleted.');
	}
	return item;
}

export function requireAuth(event: RequestEvent) {
	if (!event.locals.authed) error(401, 'Sign in first');
}
