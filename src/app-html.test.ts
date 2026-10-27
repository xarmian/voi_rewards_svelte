import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync('src/app.html', 'utf8');
const scriptPattern = /<script id="theme-init">([\s\S]*?)<\/script>/;

describe('theme initialization before first paint', () => {
	test('runs in the head before SvelteKit head content', () => {
		const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
		assert.ok(head);
		assert.match(head, scriptPattern);
		assert.ok(head.indexOf('id="theme-init"') < head.indexOf('%sveltekit.head%'));
	});

	test('declares color schemes and both browser theme colors', () => {
		assert.match(html, /<meta name="color-scheme" content="light dark"\s*\/>/);
		for (const [scheme, color] of [
			['light', '#5b21b6'],
			['dark', '#2e1065']
		]) {
			assert.ok(
				html.includes(
					`<meta name="theme-color" content="${color}" media="(prefers-color-scheme: ${scheme})" />`
				)
			);
		}
	});

	test('keeps reCAPTCHA after the body without a late theme writer', () => {
		const afterBody = html.slice(html.indexOf('</body>') + '</body>'.length);
		assert.match(afterBody, /function onRecaptchaLoad\(\)/);
		for (const script of afterBody.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
			assert.doesNotMatch(script[1], /color-theme/);
		}
	});

	const cases = [
		{ name: 'stored dark', stored: 'dark', osDark: false, dark: true, source: 'user' },
		{
			name: 'stored light overrides dark OS',
			stored: 'light',
			osDark: true,
			dark: false,
			source: 'user'
		},
		{
			name: 'absent preference follows dark OS',
			stored: null,
			osDark: true,
			dark: true,
			source: 'system'
		},
		{
			name: 'absent preference follows light OS',
			stored: null,
			osDark: false,
			dark: false,
			source: 'system'
		},
		{
			name: 'junk preference follows OS',
			stored: 'blue',
			osDark: true,
			dark: true,
			source: 'system'
		},
		{
			name: 'discover forces light',
			pathname: '/discover',
			search: '?theme=light',
			stored: 'dark',
			osDark: true,
			dark: false,
			source: 'forced'
		},
		{
			name: 'discover forces dark',
			pathname: '/discover',
			search: '?theme=dark',
			stored: 'light',
			osDark: false,
			dark: true,
			source: 'forced'
		},
		{
			name: 'invalid discover theme falls back',
			pathname: '/discover',
			search: '?theme=bogus',
			stored: 'dark',
			osDark: false,
			dark: true,
			source: 'user'
		},
		{
			name: 'theme parameter elsewhere is ignored',
			search: '?theme=light',
			stored: 'dark',
			osDark: false,
			dark: true,
			source: 'user'
		},
		{
			name: 'unavailable storage follows OS',
			stored: null,
			throws: true,
			osDark: true,
			dark: true,
			source: 'system'
		}
	];

	for (const scenario of cases) {
		test(scenario.name, () => {
			const script = html.match(scriptPattern)?.[1];
			assert.ok(script, 'theme-init script must exist');
			// Start opposite the expected state to catch scripts that only add the class.
			const classes = new Set(scenario.dark ? [] : ['dark']);
			const root = {
				classList: {
					contains: (name: string) => classes.has(name),
					toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name))
				},
				dataset: {} as Record<string, string>
			};
			let writes = 0;
			runInNewContext(script, {
				document: { documentElement: root },
				location: { pathname: scenario.pathname ?? '/', search: scenario.search ?? '' },
				URLSearchParams,
				localStorage: {
					getItem: (key: string) => {
						assert.equal(key, 'color-theme');
						if (scenario.throws) throw new Error('Storage blocked');
						return scenario.stored;
					},
					setItem: () => {
						writes += 1;
					}
				},
				matchMedia: (query: string) => {
					assert.equal(query, '(prefers-color-scheme: dark)');
					return { matches: scenario.osDark };
				}
			});
			assert.equal(root.classList.contains('dark'), scenario.dark);
			assert.equal(root.dataset.themeSource, scenario.source);
			assert.equal(writes, 0);
		});
	}
});
