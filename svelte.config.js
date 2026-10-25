import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	onwarn: (warning, handler) => {
		if (warning.code.startsWith('a11y-')) {
			return;
		}
		handler(warning);
	},

	kit: {
		// Deployed on Vercel; the adapter uses the Node runtime Vercel provides (package.json engines: 24.x).
		adapter: adapter(),
		files: {
			assets: 'static'
		}
	},
	vite: {
		optimizeDeps: {
			include: ['svelte-range-slider-pips']
		}
	}
};

export default config;
