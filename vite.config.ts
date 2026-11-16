import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
	// The image build passes the release version (see Dockerfile); local builds say -dev.
	define: { __APP_VERSION__: JSON.stringify(process.env.SAGA_VERSION || `${pkg.version}-dev`) },
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ out: 'build' }),
			// hooks.server.ts checks the Origin of every non-GET request against the host
			// (so it works behind a TLS proxy without setting ORIGIN).
			csrf: { trustedOrigins: ['*'] }
		})
	]
});
