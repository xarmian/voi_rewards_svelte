import { test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import StatTile from './StatTile.svelte';

const props = { label: 'Online stake', value: '1', href: '/analytics', onretry: () => {} };

test('the error tile is a programmatic focus target around its alert so Retry keeps focus', () => {
	const html = render(StatTile, { props: { ...props, state: 'error' } }).body;
	assert.match(html, /<div[^>]*tabindex="-1"[^>]*>[\s\S]*role="alert"/);
});

test('a linked tile stays a plain link with no tabindex', () => {
	const html = render(StatTile, { props: { ...props, state: 'ready' } }).body;
	assert.match(html, /<a[^>]*href="\/analytics"/);
	assert.doesNotMatch(html, /tabindex/);
});
