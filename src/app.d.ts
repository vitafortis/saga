// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** The release version, e.g. 0.1.42 (set at build time). */
	const __APP_VERSION__: string;
	namespace App {
		interface Error {
			message: string;
		}
		interface Locals {
			/** Signed in (or no password is configured, or a valid API token was sent). */
			authed: boolean;
			/** Origin the browser used; use instead of url.origin for share links. */
			origin: string;
			/** Whether the browser connection is https, for Secure cookies. */
			secure: boolean;
			/** Client address, for rate limits. */
			ip: string;
		}
	}
}

export {};
