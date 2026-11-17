/** Hands bytes to the browser as a download. */
export function saveBytes(data: BlobPart, name: string, type = 'application/octet-stream') {
	const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([data], { type })), download: name });
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
