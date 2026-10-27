import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import Layout from './+layout.svelte';
vi.mock('$app/state', () => ({ page: { url: new URL('https://example.com/faq') } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

test('site layout renders one of each landmark with snippet content and the current route', () => {
	const children = createRawSnippet(() => ({ render: () => '<p>Page content</p>' }));
	const html = render(Layout, { props: { children } }).body;
	assert.equal((html.match(/<header\b/g) ?? []).length, 1);
	assert.equal((html.match(/<main id="main"/g) ?? []).length, 1);
	assert.equal((html.match(/<footer\b/g) ?? []).length, 1);
	assert.match(html, /Page content/);
	assert.match(html, /href="\/how_to_node"[^>]*aria-current="page"/);
	assert.doesNotMatch(html, /footer-socialmedia|bg-gray-|dark:/);
});
