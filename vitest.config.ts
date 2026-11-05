import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

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
						testTransformMode: { web: ['**/*.svelte.ts', '**/*.svelte.test.ts'] }
					}
				}
			]
		}
	})
);
