/** Media the browser can show without running anything (no SVG, HTML or PDF). */
const INLINE = /^(image\/(png|jpeg|gif|webp|avif|bmp)|video\/(mp4|webm|ogg|quicktime)|audio\/[\w.+-]+)$/;

export const canPreview = (mime: string) => INLINE.test(mime);

/** Rough family of a MIME type, for icons. */
export function mediaKind(mime: string): 'image' | 'video' | 'audio' | 'archive' | 'text' | 'other' {
	if (/^image\//.test(mime)) return 'image';
	if (/^video\//.test(mime)) return 'video';
	if (/^audio\//.test(mime)) return 'audio';
	if (/zip|tar|gzip|x-7z|x-rar|x-xz|x-bzip/.test(mime)) return 'archive';
	if (/^text\/|json|xml|yaml|javascript/.test(mime)) return 'text';
	return 'other';
}
