import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
// typescript-eslint stays on ~8.52: from 8.53.0, @typescript-eslint/no-unused-vars throws on an
// unused legacy `$:` declaration (svelte-eslint-parser's ComputedVariable definition), which
// aborts the whole run (TASK-38 G2; the bisect is on its trail).
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default defineConfig(
	{
		ignores: ['build/', '.svelte-kit/', 'package/', '.vercel/']
	},
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
				extraFileExtensions: ['.svelte'],
				svelteConfig
			}
		}
	},
	{
		// Parity with the ESLint 8 setup (TASK-38 G2). The upgrade is tooling only, so the rule
		// surface stays where it was; each rule below can be adopted on its own later.
		rules: {
			// ESLint 9 changed the default to 'all'; ESLint 8 did not report unused catch bindings.
			'@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
			// In eslint-plugin-svelte 2's recommended set, dropped from 3's.
			'svelte/valid-compile': 'error',
			// New in eslint-plugin-svelte 3's recommended set and reported on existing code.
			'svelte/infinite-reactive-loop': 'off',
			'svelte/no-immutable-reactive-statements': 'off',
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/no-reactive-functions': 'off',
			'svelte/no-reactive-literals': 'off',
			'svelte/no-reactive-reassign': 'off',
			'svelte/no-useless-mustaches': 'off',
			'svelte/prefer-svelte-reactivity': 'off',
			'svelte/require-each-key': 'off'
		}
	}
);
