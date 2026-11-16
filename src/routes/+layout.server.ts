import { passwordRequired } from '#lib/server/auth.ts';
import { MAX_FILE_BYTES, MAX_PASTE_BYTES } from '#lib/server/config.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	authed: locals.authed,
	passwordRequired: passwordRequired(),
	maxFileBytes: MAX_FILE_BYTES,
	maxPasteBytes: MAX_PASTE_BYTES,
	origin: locals.origin
});
