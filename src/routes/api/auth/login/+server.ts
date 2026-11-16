import { error, json } from '@sveltejs/kit';
import { checkPassword, issueSession } from '#lib/server/auth.ts';
import { loginLimiter } from '#lib/server/limits.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	if (loginLimiter.blocked(locals.ip)) error(429, 'Too many attempts. Try again in 15 minutes.');
	const { password } = (await request.json().catch(() => ({}))) as { password?: string };
	if (typeof password !== 'string' || !checkPassword(password)) {
		loginLimiter.hit(locals.ip);
		error(401, 'Wrong password');
	}
	issueSession(cookies, locals.secure);
	return json({ ok: true });
};
