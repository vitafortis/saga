export class ApiError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
	}
}

/**
 * No response at all. Behind Pangolin that's usually an expired SSO session (the request is
 * redirected to the sign-in page, which the browser blocks), so say so.
 */
export const UNREACHABLE = 'Couldn’t reach Saga. Check your connection, or reload the page if your sign-in has expired.';

/** For error responses without a message from Saga (a proxy page, a crash). */
export function statusMessage(status: number): string {
	if (status === 401 || status === 403) return 'You’re not signed in any more. Reload the page to sign in again.';
	if (status === 404) return 'Not found. It may have expired or been deleted.';
	if (status === 413) return 'Too large: over the upload limit Saga or your proxy allows.';
	if (status === 429) return 'Too many requests. Wait a minute and try again.';
	if (status >= 502 && status <= 504) return `Saga isn’t responding (${status}). It may be restarting; try again in a moment.`;
	return `Something went wrong on the server (${status}).`;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, {
			method,
			// Always JSON for writes, even body-less DELETEs (see hooks.server.ts).
			headers: method === 'GET' ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
	} catch {
		throw new ApiError(UNREACHABLE, 0);
	}
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new ApiError(data.message ?? statusMessage(res.status), res.status);
	return data as T;
}

export const api = {
	get: <T>(url: string) => request<T>('GET', url),
	post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
	put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
	patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
	del: <T>(url: string) => request<T>('DELETE', url)
};

export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/** Thrown for a file the browser can't read: a folder, or a file moved or deleted since it was picked. */
export const unreadable = (name: string) =>
	new ApiError(`Couldn’t read “${name}”. Folders can’t be shared directly (zip it first), and the file may have been moved or deleted.`, 0);

/** The file's bytes, with a clear error instead of the browser's NotReadableError. */
export async function readBytes(file: File): Promise<Uint8Array> {
	try {
		return new Uint8Array(await file.arrayBuffer());
	} catch {
		throw unreadable(file.name);
	}
}

/** PUTs a file to `url` with upload progress (fetch can't report it). */
export function uploadFile<T>(file: File, url: string, onProgress: (fraction: number) => void): { done: Promise<T>; abort: () => void } {
	const xhr = new XMLHttpRequest();
	const done = new Promise<T>(async (resolve, reject) => {
		// XHR reports an unreadable file as a network error, so check first.
		try {
			await file.slice(0, 1).arrayBuffer();
		} catch {
			return reject(unreadable(file.name));
		}
		xhr.open('PUT', url);
		xhr.setRequestHeader('accept', 'application/json');
		if (file.type) xhr.setRequestHeader('content-type', file.type);
		xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
		xhr.onload = () => {
			let data: { message?: string } = {};
			try {
				data = JSON.parse(xhr.responseText);
			} catch {}
			if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
			else reject(new ApiError(data.message ?? statusMessage(xhr.status), xhr.status));
		};
		xhr.onerror = () => reject(new ApiError(`The connection dropped while sending “${file.name}”. ${UNREACHABLE.replace('Couldn’t reach Saga. ', '')}`, 0));
		xhr.onabort = () => reject(new ApiError('Upload cancelled', 0));
		xhr.send(file);
	});
	return { done, abort: () => xhr.abort() };
}
