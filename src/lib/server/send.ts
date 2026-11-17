import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { blobPath, deleteBlob } from './store.ts';
import type { Item } from '#lib/types.ts';

import { canPreview } from '#lib/media.ts';

export { canPreview };

export function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
	const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
	return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Uploaded bytes are never run as a page, whatever they claim to be. */
const BLOB_HEADERS = {
	'content-security-policy': "default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
	'cache-control': 'private, no-store'
};

/**
 * Streams a file item, with single Range support (video seeking, resumed downloads).
 * `burn`: the caller has already claimed the item; the blob is removed once sent.
 */
export function sendFile(item: Item, request: Request, opts: { inline: boolean; burn?: boolean }): Response {
	const inline = opts.inline && !item.encrypted && canPreview(item.mime);
	const headers: Record<string, string> = {
		...BLOB_HEADERS,
		'content-type': inline ? item.mime : item.mime.startsWith('text/') && !item.encrypted ? 'text/plain; charset=utf-8' : 'application/octet-stream',
		// Encrypted files download as name.enc: `openssl enc -d … -in name.enc -out name`.
		'content-disposition': contentDisposition(inline ? 'inline' : 'attachment', item.encrypted ? `${item.name}.enc` : item.name),
		'accept-ranges': opts.burn ? 'none' : 'bytes'
	};
	let start = 0;
	let end = item.size - 1;
	let status = 200;
	const range = !opts.burn && request.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
	if (range && item.size > 0) {
		const [, a, b] = range;
		if (a === '') start = Math.max(0, item.size - Number(b));
		else {
			start = Number(a);
			if (b !== '') end = Math.min(end, Number(b));
		}
		if (start > end || start >= item.size) {
			return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${item.size}` } });
		}
		status = 206;
		headers['content-range'] = `bytes ${start}-${end}/${item.size}`;
	}
	headers['content-length'] = String(item.size === 0 ? 0 : end - start + 1);
	if (request.method === 'HEAD' || item.size === 0) {
		if (opts.burn) void deleteBlob(item.code);
		return new Response(null, { status, headers });
	}
	const stream = createReadStream(blobPath(item.code), { start, end });
	if (opts.burn) stream.once('close', () => void deleteBlob(item.code));
	return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers });
}

export function sendText(text: string, name: string, download: boolean): Response {
	return new Response(text, {
		headers: {
			...BLOB_HEADERS,
			'content-type': 'text/plain; charset=utf-8',
			'content-disposition': contentDisposition(download ? 'attachment' : 'inline', name)
		}
	});
}

/** File name for downloading a paste; encrypted ones are base64 (`openssl enc -d -a -A …`). */
export function pasteFileName(item: Item): string {
	const name = item.name ? (/\.\w{1,8}$/.test(item.name) ? item.name : `${item.name}.txt`) : `${item.code}.txt`;
	return item.encrypted ? `${name}.b64.enc` : name;
}
