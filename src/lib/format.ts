export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let v = n / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** "in 3 hours", "5 minutes ago". */
export function relativeTime(at: number, now = Date.now()): string {
	const diff = at - now;
	const abs = Math.abs(diff);
	const steps: [number, Intl.RelativeTimeFormatUnit][] = [
		[60_000, 'second'],
		[3_600_000, 'minute'],
		[86_400_000, 'hour'],
		[30 * 86_400_000, 'day'],
		[365 * 86_400_000, 'month'],
		[Infinity, 'year']
	];
	const size: Record<string, number> = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, month: 30 * 86_400_000, year: 365 * 86_400_000 };
	const unit = steps.find(([limit]) => abs < limit)![1];
	return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(diff / size[unit]), unit);
}

/** Codes read in groups of four: 1234 5678. */
export function groupCode(code: string): string {
	return code.replace(/(\d{4})(?=\d)/g, '$1 ');
}
