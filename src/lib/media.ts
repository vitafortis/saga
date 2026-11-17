/**
 * Media the browser can show without running anything of ours. SVG is fine: it's shown in an
 * <img> (no scripts) and served with a sandbox CSP. PDF opens in the browser's own viewer. Never HTML.
 */
const INLINE = /^(image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml)|video\/(mp4|webm|ogg|quicktime)|audio\/[\w.+-]+|application\/pdf)$/;

export const canPreview = (mime: string) => INLINE.test(mime);

/** How much of a text file the file page shows. */
export const TEXT_PREVIEW_BYTES = 256 * 1024;

/** Rough family of a MIME type, for icons. */
export function mediaKind(mime: string): 'image' | 'video' | 'audio' | 'archive' | 'text' | 'other' {
	if (/^image\//.test(mime)) return 'image';
	if (/^video\//.test(mime)) return 'video';
	if (/^audio\//.test(mime)) return 'audio';
	if (/zip|tar|gzip|x-7z|x-rar|x-xz|x-bzip/.test(mime)) return 'archive';
	if (/^text\/|json|xml|yaml|javascript/.test(mime)) return 'text';
	return 'other';
}
