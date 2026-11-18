/** Starts a download of a same-origin URL, leaving the page as it is. */
export function saveUrl(href: string) {
	Object.assign(document.createElement('a'), { href, download: '' }).click();
}

/** Hands bytes to the browser as a download. */
export function saveBytes(data: BlobPart, name: string, type = 'application/octet-stream') {
	const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([data], { type })), download: name });
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * The files in a drop, with folders split out: browsers list a dropped folder as a File it then
 * can't read, so it's caught here rather than failing the upload.
 */
export function droppedFiles(dt: DataTransfer | null | undefined): { files: File[]; folders: string[] } {
	const files: File[] = [];
	const folders: string[] = [];
	if (!dt) return { files, folders };
	const list = Array.from(dt.files);
	const items = Array.from(dt.items).filter((i) => i.kind === 'file');
	list.forEach((file, i) => {
		const entry = items.length === list.length ? items[i].webkitGetAsEntry?.() : null;
		if (entry?.isDirectory) folders.push(file.name);
		else files.push(file);
	});
	return { files, folders };
}

export const folderMessage = (folders: string[]) =>
	`${folders.length === 1 ? `“${folders[0]}” is a folder` : `${folders.length} folders were skipped`}. Folders can’t be shared directly: zip it first, or select the files inside.`;
