import { db } from './db.ts';
import { DEFAULT_SETTINGS, isExpiry, type Settings } from '#lib/types.ts';

export function getSettings(): Settings {
	const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
	const saved = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
	return {
		defaultExpiry: isExpiry(saved.defaultExpiry) ? saved.defaultExpiry : DEFAULT_SETTINGS.defaultExpiry,
		defaultBurn: typeof saved.defaultBurn === 'boolean' ? saved.defaultBurn : DEFAULT_SETTINGS.defaultBurn
	};
}

/** Saves the valid fields of `input`; returns an error message for the first invalid one. */
export function saveSettings(input: Record<string, unknown>): string | null {
	const updates: [string, unknown][] = [];
	if ('defaultExpiry' in input) {
		if (!isExpiry(input.defaultExpiry)) return 'Unknown expiry';
		updates.push(['defaultExpiry', input.defaultExpiry]);
	}
	if ('defaultBurn' in input) {
		if (typeof input.defaultBurn !== 'boolean') return 'defaultBurn must be true or false';
		updates.push(['defaultBurn', input.defaultBurn]);
	}
	const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
	for (const [k, v] of updates) put.run(k, JSON.stringify(v));
	return null;
}

/** `burn` from a query string: absent → the default; `0`/`false`/`no` → off; anything else → on. */
export function burnParam(value: string | null): boolean {
	if (value === null) return getSettings().defaultBurn;
	return !/^(0|false|no|off)$/i.test(value);
}
