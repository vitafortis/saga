import { error, json } from '@sveltejs/kit';
import { MAX_PASTE_BYTES } from '#lib/server/config.ts';
import { requireAuth } from '#lib/server/lookup.ts';
import { cleanMode, cleanPath, deleteItem, getItem, isEncryptedText, updateItem } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** `{ name?, content? }`, plus `{ path?, mode? }` for items in a collection. */
export const PATCH: RequestHandler = async (event) => {
	requireAuth(event);
	const item = getItem(event.params.code);
	if (!item) error(404, 'Not found');
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) error(400, 'Expected JSON');
	const changes: Parameters<typeof updateItem>[1] = {};
	if (typeof body.name === 'string') changes.name = body.name.trim() || item.name;
	if (typeof body.content === 'string') {
		if (item.kind !== 'paste') error(400, 'Only text can be edited');
		if (Buffer.byteLength(body.content) > MAX_PASTE_BYTES) error(413, 'Too large');
		// Encrypted text can only be replaced with other ciphertext (re-encrypted in the browser).
		if (item.encrypted && !isEncryptedText(body.content.trim())) error(400, 'This file is encrypted; send encrypted content');
		changes.content = item.encrypted ? body.content.trim() : body.content;
	}
	if (('path' in body || 'mode' in body) && !item.collection) error(400, 'Only items in a collection have a path');
	if ('path' in body) {
		const p = cleanPath(typeof body.path === 'string' ? body.path : null);
		if (p instanceof Error) error(400, p.message);
		changes.path = p;
	}
	if ('mode' in body) {
		const m = cleanMode(typeof body.mode === 'string' ? body.mode : null);
		if (m instanceof Error) error(400, m.message);
		changes.mode = m;
	}
	return json(updateItem(item.code, changes));
};

export const DELETE: RequestHandler = async (event) => {
	requireAuth(event);
	if (!(await deleteItem(event.params.code))) error(404, 'Not found');
	return json({ ok: true });
};
