import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { blobPath, deleteBlob } from './store.ts';
import type { Item } from '#lib/types.ts';

import { canPreview, TEXT_PREVIEW_BYTES } from '#lib/media.ts';

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
	// The browser's PDF viewer won't run in a sandbox, and the file page shows it in a frame.
	// Still no scripts of the page's own, and only Saga may frame it.
	if (inline && item.mime === 'application/pdf') {
		headers['content-security-policy'] = "default-src 'none'; frame-ancestors 'self'";
		headers['x-frame-options'] = 'SAMEORIGIN';
	}
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

/**
 * The start of a file, if it's text: no NUL bytes and valid UTF-8. Decided by content, not MIME,
 * as configs, keys and logs usually arrive as application/octet-stream.
 */
export async function textPreview(item: Item): Promise<{ text: string; truncated: boolean } | null> {
	if (item.size === 0) return { text: '', truncated: false };
	const fh = await open(blobPath(item.code));
	try {
		const buf = Buffer.alloc(Math.min(item.size, TEXT_PREVIEW_BYTES));
		const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
		const bytes = buf.subarray(0, bytesRead);
		if (bytes.includes(0)) return null;
		// stream: a character cut off at the end of the sample isn't an error.
		const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: bytesRead < item.size });
		return { text, truncated: bytesRead < item.size };
	} catch {
		return null;
	} finally {
		await fh.close();
	}
}
