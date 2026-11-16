export class ApiError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
	}
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
	const res = await fetch(url, {
		method,
		// Always JSON for writes, even body-less DELETEs (see hooks.server.ts).
		headers: method === 'GET' ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new ApiError(data.message ?? res.statusText, res.status);
	return data as T;
}

export const api = {
	get: <T>(url: string) => request<T>('GET', url),
	post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
	del: <T>(url: string) => request<T>('DELETE', url)
};

export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/** PUTs a file with upload progress (fetch can't report it). */
export function uploadFile(
	file: File,
	opts: { expiry: string; burn: boolean },
	onProgress: (fraction: number) => void
): { done: Promise<{ item: import('#lib/types.ts').Item; url: string }>; abort: () => void } {
	const xhr = new XMLHttpRequest();
	const q = new URLSearchParams({ name: file.name, expiry: opts.expiry });
	if (opts.burn) q.set('burn', '1');
	const done = new Promise<{ item: import('#lib/types.ts').Item; url: string }>((resolve, reject) => {
		xhr.open('PUT', `/api/files?${q}`);
		xhr.setRequestHeader('accept', 'application/json');
		if (file.type) xhr.setRequestHeader('content-type', file.type);
		xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
		xhr.onload = () => {
			let data: { message?: string } = {};
			try {
				data = JSON.parse(xhr.responseText);
			} catch {}
			if (xhr.status >= 200 && xhr.status < 300) resolve(data as { item: import('#lib/types.ts').Item; url: string });
			else reject(new ApiError(data.message ?? (xhr.status === 413 ? 'File too large' : `Upload failed (${xhr.status})`), xhr.status));
		};
		xhr.onerror = () => reject(new ApiError('Upload failed: network error', 0));
		xhr.onabort = () => reject(new ApiError('Upload cancelled', 0));
		xhr.send(file);
	});
	return { done, abort: () => xhr.abort() };
}
