import { test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import HealthRing from './HealthRing.svelte';

test('the error state is a programmatic focus target around its alert so Retry keeps focus', () => {
	const html = render(HealthRing, {
		props: { value: 0, total: 0, state: 'error', onretry: () => {} }
	}).body;
	assert.match(html, /<div[^>]*tabindex="-1"[^>]*>[\s\S]*role="alert"/);
});
