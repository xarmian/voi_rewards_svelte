import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Vitest matches testTransformMode globs against absolute paths without picomatch's dot
// option, so a bare `**` never crosses a hidden directory above the checkout. Anchor them
// at the root, escaped so glob characters in the checkout path match literally.
const root = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\*?[\]{}()!+@|]/g, '\\$&');

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			projects: [
				{
					extends: true,
					test: {
						name: 'unit',
						include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
						exclude: ['**/node_modules/**', 'src/**/*.svelte.test.ts'],
						environment: 'node'
					}
				},
				{
					// Rune code (`$effect.root`, `flushSync`) needs Svelte's client runtime, and
					// avm-wallet-svelte ships client-compiled runes. Everything else stays on the
					// server runtime of the project above.
					extends: true,
					resolve: { conditions: ['browser'] },
					test: {
						name: 'runes',
						include: ['src/**/*.svelte.test.ts'],
						environment: 'node',
						testTransformMode: { web: [`${root}**/*.svelte.ts`, `${root}**/*.svelte.test.ts`] }
					}
				}
			]
		}
	})
);
