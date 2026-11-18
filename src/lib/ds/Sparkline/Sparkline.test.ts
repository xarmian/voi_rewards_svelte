import { test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import Sparkline from './Sparkline.svelte';

test('the error state is a programmatic focus target around its alert so Retry keeps focus', () => {
	const html = render(Sparkline, {
		props: { values: [], label: 'APR', state: 'error', onretry: () => {} }
	}).body;
	assert.match(html, /<div[^>]*tabindex="-1"[^>]*>[\s\S]*role="alert"/);
});
