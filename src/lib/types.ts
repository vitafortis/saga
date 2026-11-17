export type ItemKind = 'paste' | 'file';

/** An item as the browser sees it (never includes paste content or the blob path). */
export type Item = {
	code: string;
	kind: ItemKind;
	/** Paste title or file name. */
	name: string;
	/** MIME type (files) or text/plain (pastes). */
	mime: string;
	size: number;
	createdAt: number;
	/** Epoch ms, or null for never. */
	expiresAt: number | null;
	/** Deleted the first time it's opened. */
	burn: boolean;
	views: number;
};

export const EXPIRY_OPTIONS = [
	{ value: '10m', label: '10 minutes', ms: 10 * 60_000 },
	{ value: '1h', label: '1 hour', ms: 3_600_000 },
	{ value: '1d', label: '1 day', ms: 86_400_000 },
	{ value: '7d', label: '1 week', ms: 7 * 86_400_000 },
	{ value: '30d', label: '30 days', ms: 30 * 86_400_000 },
	{ value: 'never', label: 'Never', ms: null }
] as const;

export type Expiry = (typeof EXPIRY_OPTIONS)[number]['value'];

/** Defaults for new items, kept on the server so every device (and curl) gets the same ones. */
export type Settings = {
	defaultExpiry: Expiry;
	defaultBurn: boolean;
};

export const DEFAULT_SETTINGS: Settings = { defaultExpiry: '1d', defaultBurn: false };

export const isExpiry = (v: unknown): v is Expiry => EXPIRY_OPTIONS.some((o) => o.value === v);
