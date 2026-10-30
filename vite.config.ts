import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	define: { global: 'globalThis' },
	resolve: {
		alias: [
			// One bignumber.js copy, and the CommonJS one (TASK-38 G3). Its exports map sends `require`
			// to bignumber.js and `import` to bignumber.mjs. Two reasons:
			// - Dedupe: Vite 6 honours `require` for CommonJS importers, so json-bigint (algosdk's) and
			//   ulujs (ESM) would each bundle a copy (+8 KB gzip).
			// - Correctness: resolving both to the .mjs (Vite 5's behaviour) hands json-bigint's
			//   require() the ESM namespace instead of the class, so its BigNumber mode throws
			//   ("isBigNumber is not a function"). The CJS build works for both: an ESM default import
			//   of it gets module.exports, the class.
			// Remove when bignumber.js's exports map stops splitting the two, or when algosdk no longer
			// depends on json-bigint.
			{ find: /^bignumber\.js$/, replacement: 'bignumber.js/bignumber.js' }
		]
	},
	optimizeDeps: {
		include: ['svelte-range-slider-pips']
	},
	ssr: {
		noExternal: ['three']
	}
});
