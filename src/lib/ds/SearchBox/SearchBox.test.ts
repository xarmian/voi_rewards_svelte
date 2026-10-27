import { readFileSync } from 'node:fs';
import { errorClass, shouldCollapse } from './behavior';
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

for (const collapseBelow of ['md', 'lg'] as const) {
	test(`compact collapse breakpoint ${collapseBelow}`, () => {
		const html = render(SearchBox, {
			props: { variant: 'compact', onsubmit, ...(collapseBelow === 'lg' ? { collapseBelow } : {}) }
		}).body;
		const toggle = html.match(/<button[^>]*aria-label="Search wallets"[^>]*>/)?.[0] ?? '';
		const form = html.match(/<form[^>]*>/)?.[0] ?? '';
		assert.ok(toggle.includes(`${collapseBelow}:hidden`));
		assert.ok(form.includes(`hidden ${collapseBelow}:block`));
	});
}
test('error contrast follows the field variant and surrounding tone', () => {
	assert.match(errorClass('compact', 'hero'), /bg-surface/);
	assert.match(errorClass('compact', 'hero'), /text-danger/);
	assert.match(errorClass('compact', 'hero'), /absolute inset-x-0 top-full/);
	assert.equal(errorClass('compact', 'surface'), 'mt-2 text-sm text-danger');
	for (const tone of ['hero', 'surface'] as const) {
		assert.equal(errorClass('hero', tone), 'mt-2 text-sm text-on-hero');
	}
	const source = readFileSync(new URL('./SearchBox.svelte', import.meta.url), 'utf8');
	assert.match(source, /class=\{errorClass\(variant, tone\)\}/);
});
test('only revealed collapsible compact searches dismiss on success or focus leaving without error', () => {
	const state = {
		compact: true,
		collapsible: true,
		revealed: true,
		leaving: true,
		hasError: false,
		submitted: false
	};
	assert.equal(shouldCollapse(state), true);
	assert.equal(shouldCollapse({ ...state, leaving: false }), false);
	assert.equal(shouldCollapse({ ...state, hasError: true }), false);
	assert.equal(shouldCollapse({ ...state, leaving: false, submitted: true }), true);
	for (const key of ['compact', 'collapsible', 'revealed'] as const) {
		assert.equal(shouldCollapse({ ...state, [key]: false }), false);
		assert.equal(shouldCollapse({ ...state, [key]: false, submitted: true }), false);
	}
	const source = readFileSync(new URL('./SearchBox.svelte', import.meta.url), 'utf8');
	assert.match(
		source,
		/if \(result.ok\) \{[\s\S]*?shouldCollapse\([\s\S]*?revealed = false;[\s\S]*?onsubmit\(result.address\)/
	);
	assert.match(source, /function focusout[\s\S]*?shouldCollapse\([\s\S]*?revealed = false;/);
});
