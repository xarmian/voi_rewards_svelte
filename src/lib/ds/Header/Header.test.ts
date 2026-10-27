import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import Header from './Header.svelte';
import { navItems } from './nav';
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
const markup = (current: 'staking' | 'home' | null = 'staking') =>
	render(Header, { props: { variant: 'bar', current } }).body;

test('skip link is first focusable element and main navigation uses real internal links', () => {
	const html = markup();
	assert.match(html.match(/<(?:a|button|input)\b[^>]*>/)?.[0] ?? '', /href="#main"/);
	assert.match(html, /Skip to content/);
	const nav = html.match(/<nav aria-label="Main"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
	const links = [...nav.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
	assert.equal(links.length, 5);
	navItems.forEach((item, i) => assert.ok(links[i].includes(`href="${item.href}"`)));
	assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1);
	assert.match(links[1], /aria-current="page"/);
	assert.doesNotMatch(markup(null), /aria-current="page"/);
	assert.doesNotMatch(nav, /target=|data-sveltekit-reload|onclick=/);
	assert.doesNotMatch(html, /href="(?:https:\/\/ecosystem\.voi\.network|\/ecosystem)"/);
});
test('search landmarks have unique ids, hero toggle contrast, and a visible menu form', () => {
	const html = markup(null);
	for (const id of ['ds-search-header', 'ds-search-menu']) {
		assert.match(html, new RegExp(`<form id="${id}-form"`));
		assert.doesNotMatch(markup('home'), new RegExp(id));
	}
	assert.match(html, /aria-label="Header wallet search"/);
	assert.match(html, /aria-label="Menu wallet search"/);
	const toggle = html.match(/<button[^>]*aria-label="Search wallets"[^>]*>/)?.[0] ?? '';
	assert.match(toggle, /text-on-hero/);
	const menu = html.match(/<form id="ds-search-menu-form"[^>]*>/)?.[0] ?? '';
	assert.doesNotMatch(menu, /hidden/);
	const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
	assert.equal(new Set(ids).size, ids.length);
});
test('native mobile dialog starts closed with its close control first', () => {
	const html = markup();
	assert.match(html, /<button[^>]*aria-expanded="false"[^>]*aria-controls="site-menu"/);
	const dialog = html.match(/<dialog id="site-menu"[^>]*>([\s\S]*?)<\/dialog>/)?.[1] ?? '';
	assert.match(
		dialog.match(/<(?:a|button|input)\b[\s\S]*?<\/(?:a|button)>/)?.[0] ?? '',
		/Close menu/
	);
	assert.match(html, /aria-label="Site menu"/);
});
test('badge starts neutral with a separate empty live region in both variants', () => {
	for (const variant of ['bar', 'hero'] as const) {
		const html = render(Header, { props: { variant, current: 'home' } }).body;
		const badge = html.match(/<p[^>]*>[\s\S]*?Checking chain…[\s\S]*?<\/p>/)?.[0] ?? '';
		assert.ok(badge);
		assert.doesNotMatch(badge, /role=|aria-live=/);
		assert.match(html, /<span class="sr-only" role="status">(?:<!--[\s\S]*?-->)?\s*<\/span>/);
		assert.doesNotMatch(html, /#0|NaN/);
	}
});

test('desktop navigation and header search start at lg', () => {
	const html = markup();
	assert.match(html.match(/<nav aria-label="Main"[^>]*>/)?.[0] ?? '', /lg:block/);
	assert.match(html.match(/<button[^>]*aria-label="Menu"[^>]*>/)?.[0] ?? '', /lg:hidden/);
	assert.match(html.match(/<form id="ds-search-header-form"[^>]*>/)?.[0] ?? '', /hidden lg:block/);
});
