import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { API_TOKEN, PASSWORD, SECRET } from './config.ts';

export const COOKIE = 'saga_session';
const MAX_AGE = 30 * 86_400; // seconds

const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('base64url');

function safeEqual(a: string, b: string): boolean {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}

export const passwordRequired = () => PASSWORD !== '';

export function checkPassword(input: string): boolean {
	// Compare HMACs so the comparison takes the same time whatever the length.
	return passwordRequired() && safeEqual(sign(`pw:${input}`), sign(`pw:${PASSWORD}`));
}

/** A session is `<expiry>.<hmac>`; the HMAC also covers the password, so changing it signs everyone out. */
export function issueSession(cookies: Cookies, secure: boolean) {
	const exp = String(Date.now() + MAX_AGE * 1000);
	cookies.set(COOKIE, `${exp}.${sign(`session:${exp}:${PASSWORD}`)}`, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: MAX_AGE
	});
}

export function isAuthed(cookies: Cookies, headers: Headers): boolean {
	if (!passwordRequired()) return true;
	const bearer = headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
	if (bearer && API_TOKEN && safeEqual(sign(`pw:${bearer}`), sign(`pw:${API_TOKEN}`))) return true;
	const value = cookies.get(COOKIE);
	if (!value) return false;
	const [exp, mac] = value.split('.');
	if (!exp || !mac || Number(exp) < Date.now()) return false;
	return safeEqual(mac, sign(`session:${exp}:${PASSWORD}`));
}
