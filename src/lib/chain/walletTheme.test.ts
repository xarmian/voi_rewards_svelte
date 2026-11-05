import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// avm-wallet-svelte 3 styles its components entirely through --avm-* CSS variables and defines them
// in a stylesheet it exports separately. Without that import the wallet picker, account list and
// modals render with no colours, backgrounds or borders (TASK-138).
const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const libraryDist = 'node_modules/avm-wallet-svelte/dist/';

test('the root layout imports the wallet library theme', () => {
	expect(read('src/routes/+layout.svelte')).toMatch(
		/^\s*import 'avm-wallet-svelte\/styles\/theme\.css';$/m
	);
});

test('the theme defines every variable the installed wallet components read', () => {
	const used = new Set<string>();
	const components = readdirSync(new URL(`${libraryDist}components/`, root)).filter((name) =>
		name.endsWith('.svelte')
	);
	expect(components.length).toBeGreaterThan(0);
	for (const name of components)
		for (const match of read(`${libraryDist}components/${name}`).matchAll(
			/var\((--avm-[a-z0-9-]+)/g
		))
			used.add(match[1]);
	expect(used.size, 'the components read theme variables').toBeGreaterThan(0);

	const defined = new Set(
		[...read(`${libraryDist}styles/theme.css`).matchAll(/(--avm-[a-z0-9-]+)\s*:/g)].map(
			(match) => match[1]
		)
	);
	// A library upgrade that reads a variable its theme does not define would leave that property unset.
	expect([...used].filter((name) => !defined.has(name))).toEqual([]);
});

test('the theme darkens under the class this app toggles on the root element', () => {
	expect(read(`${libraryDist}styles/theme.css`)).toMatch(/^\.dark,/m);
	expect(read('src/app.html')).toContain("classList.toggle('dark'");
});

// The library opens its dropdown with left: 0 under the trigger. The wallet page puts its pickers at
// the right edge (page header and sidebar), so the panel ran off-screen at 1440 and at 390 wide.
test('the wallet page pickers open leftwards, so the dropdown stays on screen', () => {
	const page = read('src/routes/(site)/wallet/[...id]/+page.svelte');
	const pickers = page.match(/<Web3Wallet\b/g)?.length ?? 0;
	expect(pickers).toBeGreaterThan(0);
	expect(page.match(/class="avm-wallet-end [^"]*"/g)).toHaveLength(pickers);

	const css = read('src/app.css');
	// Three classes, so it outranks the library's scoped rule in any stylesheet order.
	const rule = css.match(/^\.avm-wallet\.avm-wallet-end \.avm-wallet__dropdown \{([^}]*)\}/m);
	expect(rule, 'the global rule exists').not.toBeNull();
	expect(rule?.[1]).toMatch(/left:\s*auto;/);
	expect(rule?.[1]).toMatch(/right:\s*0;/);
});
