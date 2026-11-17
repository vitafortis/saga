import { passwordRequired } from '#lib/server/auth.ts';
import { BACKUP_DIR, MAX_FILE_BYTES, MAX_PASTE_BYTES } from '#lib/server/config.ts';
import { getSettings } from '#lib/server/settings.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	authed: locals.authed,
	passwordRequired: passwordRequired(),
	maxFileBytes: MAX_FILE_BYTES,
	maxPasteBytes: MAX_PASTE_BYTES,
	origin: locals.origin,
	settings: getSettings(),
	/** A NAS folder is set up: show Save to NAS. */
	backups: !!BACKUP_DIR
});
