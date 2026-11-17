import { json } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { bearer, checkKey } from '#lib/server/api-keys.ts';
import { isAuthed } from '#lib/server/auth.ts';
import { keyLimiter } from '#lib/server/limits.ts';
import { sweep } from '#lib/server/store.ts';

export const init: ServerInit = () => {
	const run = () => sweep().catch((err) => console.error('[saga] sweep failed', err));
	run();
	setInterval(run, 5 * 60_000).unref();
};

/**
 * The origin the browser used, for share links and Secure cookies. ORIGIN wins when set;
 * otherwise a reverse proxy's X-Forwarded-* headers, otherwise plain http (Node serves no TLS
 * itself; adapter-node would assume https).
 */
function visibleOrigin(url: URL, h: Headers): string {
	if (process.env.ORIGIN) return url.origin;
	const first = (v: string | null) => v?.split(',')[0].trim() || '';
	const proto = first(h.get('x-forwarded-proto')) === 'https' ? 'https' : 'http';
	const host = first(h.get('x-forwarded-host')) || h.get('host') || url.host;
	return `${proto}://${host}`;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { method } = event.request;

	// Writes must come from our own host. Browsers always send Origin on cross-site and
	// non-GET requests, so a mismatch means a forged request. Hosts are compared (not full
	// origins) so it works by IP, hostname, or behind a TLS-terminating proxy without ORIGIN.
	if (method !== 'GET' && method !== 'HEAD') {
		const origin = event.request.headers.get('origin');
		if (origin && origin !== 'null') {
			const h = event.request.headers;
			const allowed = [event.url.host, h.get('host'), h.get('x-forwarded-host')].filter(Boolean);
			let host = '';
			try {
				host = new URL(origin).host;
			} catch {}
			if (!allowed.includes(host)) return json({ message: 'Cross-origin request blocked' }, { status: 403 });
		}
	}

	event.locals.origin = visibleOrigin(event.url, event.request.headers);
	event.locals.secure = event.locals.origin.startsWith('https:');
	try {
		event.locals.ip = event.getClientAddress();
	} catch {
		event.locals.ip = 'unknown';
	}

	// /api/v1 is for scripts and sagacp, and is what a reverse proxy (Pangolin) lets through
	// without SSO. So it always takes an API key, whether or not Saga has a password, and
	// nothing else: no session cookie, no "behind SSO, everyone's signed in".
	if (event.url.pathname.startsWith('/api/v1/') && event.url.pathname !== '/api/v1/health') {
		if (keyLimiter.blocked(event.locals.ip)) return json({ message: 'Too many bad API keys. Try again later.' }, { status: 429 });
		const key = bearer(event.request.headers);
		if (!key || !checkKey(key)) {
			keyLimiter.hit(event.locals.ip);
			return json({ message: 'API key required: Authorization: Bearer <key> (create one in Settings)' }, { status: 401, headers: { 'www-authenticate': 'Bearer' } });
		}
		event.locals.authed = true;
	} else {
		event.locals.authed = isAuthed(event.cookies, event.request.headers);
	}

	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	// Share links carry the code; never leak them to other sites.
	response.headers.set('Referrer-Policy', 'no-referrer');
	return response;
};
