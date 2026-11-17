import script from '#lib/server/sagacp.sh?raw';
import type { RequestHandler } from './$types';

/** The sagacp CLI, with this server's address filled in. */
export const GET: RequestHandler = ({ locals }) =>
	new Response(script.replaceAll('__SAGA_URL__', locals.origin), {
		headers: {
			'content-type': 'text/x-shellscript; charset=utf-8',
			'content-disposition': 'inline; filename="sagacp"',
			'content-security-policy': "default-src 'none'; sandbox",
			'cache-control': 'no-cache'
		}
	});
