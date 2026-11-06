import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// avm-wallet-svelte styles its components through --avm-* CSS variables. From 3.1.0 the widget
// imports the stylesheet that defines them itself, at zero specificity, so this app imports nothing.
// These tests keep a library upgrade from leaving those variables undefined or the dark theme broken.
const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const libraryDist = 'node_modules/avm-wallet-svelte/dist/';

const theme = stripComments(read(`${libraryDist}styles/theme.css`));
// The theme's token blocks hold no nested braces, so a block is its selector up to the first `}`.
function block(selector: RegExp) {
	const match = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(theme);
	return match ? { index: match.index, body: match[1] } : null;
}
const variables = (body: string) =>
	new Set([...body.matchAll(/(--avm-[a-z0-9-]+)\s*:/g)].map((match) => match[1]));

test('the wallet widget imports its own theme', () => {
	expect(stripComments(read(`${libraryDist}components/Web3Wallet.svelte`))).toMatch(
		/^\s*import '\.\.\/styles\/theme\.css';$/m
	);
});

test('the light block defines every variable the installed wallet components read', () => {
	const used = new Set<string>();
	const components = (
		readdirSync(new URL(`${libraryDist}components/`, root), { recursive: true }) as string[]
	).filter((name) => name.endsWith('.svelte'));
	expect(components.length).toBeGreaterThan(0);
	for (const name of components)
		for (const match of stripComments(read(`${libraryDist}components/${name}`)).matchAll(
			/var\((--avm-[a-z0-9-]+)/g
		))
			used.add(match[1]);
	expect(used.size, 'the components read theme variables').toBeGreaterThan(0);

	const light = block(/:where\(:root\)/);
	expect(light, 'the theme has a :where(:root) block').not.toBeNull();
	const defined = variables(light!.body);
	// A library upgrade that reads a variable its light block does not define would leave it unset.
	expect([...used].filter((name) => !defined.has(name))).toEqual([]);
});

test('the dark block follows the light block and redefines the colours, under the class this app toggles', () => {
	const light = block(/:where\(:root\)/);
	const dark = block(/:where\(\.dark[^{]*\)/);
	expect(light, 'the theme has a :where(:root) block').not.toBeNull();
	expect(dark, 'the theme has a :where(.dark ...) block').not.toBeNull();
	// Both blocks sit at zero specificity, so the later one wins: dark must come after light.
	expect(dark!.index).toBeGreaterThan(light!.index);
	const redefined = variables(dark!.body);
	for (const name of [
		'--avm-color-primary',
		'--avm-color-on-primary',
		'--avm-bg-primary',
		'--avm-text-primary'
	])
		expect(redefined.has(name), `the dark block redefines ${name}`).toBe(true);
	expect(read('src/app.html')).toContain("classList.toggle('dark'");
});
