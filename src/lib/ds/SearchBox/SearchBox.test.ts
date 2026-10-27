import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import SearchBox from './SearchBox.svelte';
import Card from '../Card/Card.svelte';
const onsubmit = () => undefined;
for (const variant of ['hero', 'compact'] as const) {
	test(`${variant} search landmark and combobox wiring`, () => {
		const html = render(SearchBox, {
			props: { variant, onsubmit, buttonLabel: 'Find wallet' }
		}).body;
		const id = `ds-search-${variant}`;
		assert.match(
			html,
			new RegExp(
				`<form[^>]*role="search"[^>]*aria-label="${variant === 'hero' ? 'Wallet search' : 'Header wallet search'}"`
			)
		);
		assert.match(html, new RegExp(`<label for="${id}-input"`));
		const input = html.match(/<input[^>]*>/)?.[0] ?? '';
		for (const attr of [
			`id="${id}-input"`,
			'role="combobox"',
			'aria-expanded="false"',
			`aria-controls="${id}-listbox"`,
			'autocomplete="off"',
			'spellcheck="false"',
			'autocapitalize="none"'
		])
			assert.ok(input.includes(attr), attr);
		assert.match(html, /<button[^>]*type="submit"[^>]*>[\s\S]*?Find wallet/);
		assert.doesNotMatch(input, /autofocus/);
	});
}
test('hero examples are links and two instances have unique IDs', () => {
	const children = createRawSnippet(() => ({
		render: () =>
			`<div>${render(SearchBox, { props: { variant: 'hero', onsubmit, examples: [{ label: 'example.voi', href: '/wallet/example' }] } }).body}${render(SearchBox, { props: { variant: 'compact', onsubmit } }).body}</div>`
	}));
	const html = render(Card, { props: { children } }).body;
	assert.match(html, /<a href="\/wallet\/example"[^>]*>example.voi<\/a>/);
	const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
	assert.equal(new Set(ids).size, ids.length);
});

for (const tone of ['surface', 'hero'] as const) {
	test(`compact toggle ${tone} contrast`, () => {
		const html = render(SearchBox, {
			props: { variant: 'compact', onsubmit, ...(tone === 'hero' ? { tone } : {}) }
		}).body;
		const toggle = html.match(/<button[^>]*aria-label="Search wallets"[^>]*>/)?.[0] ?? '';
		assert.match(toggle, tone === 'hero' ? /text-on-hero bg-on-hero-surface/ : /text-accent/);
		assert.match(html, /bg-surface text-ink/);
	});
}
test('noncollapsing compact search has no toggle and always displays its form', () => {
	const html = render(SearchBox, {
		props: { variant: 'compact', onsubmit, collapsible: false }
	}).body;
	assert.doesNotMatch(html, /aria-label="Search wallets"/);
	const form = html.match(/<form[^>]*>/)?.[0] ?? '';
	assert.match(form, /class="block(?: [^"]*)?"/);
	assert.doesNotMatch(form, /hidden/);
});
