/** Fixed-window counters per key (IP), in memory. Enough for one container. */
export class Limiter {
	private hits = new Map<string, { count: number; reset: number }>();
	private max: number;
	private windowMs: number;

	constructor(max: number, windowMs: number) {
		this.max = max;
		this.windowMs = windowMs;
	}

	/** Whether `key` is over the limit (doesn't count a hit). */
	blocked(key: string): boolean {
		const h = this.hits.get(key);
		return !!h && h.reset > Date.now() && h.count >= this.max;
	}

	hit(key: string) {
		const now = Date.now();
		const h = this.hits.get(key);
		if (!h || h.reset <= now) this.hits.set(key, { count: 1, reset: now + this.windowMs });
		else h.count++;
		if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
	}
}

/** Wrong passwords. */
export const loginLimiter = new Limiter(10, 15 * 60_000);
/** Codes that don't exist: stops anyone walking the code space. */
export const missLimiter = new Limiter(30, 10 * 60_000);
