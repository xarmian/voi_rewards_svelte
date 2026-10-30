import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import { isLoading } from '$lib/stores/loadingStore';
import LoadingIndicator from './LoadingIndicator.svelte';

afterEach(() => isLoading.set(false));

test.each([false, true])('keeps the status region mounted when loading is %s', (loading) => {
	isLoading.set(loading);
	const html = render(LoadingIndicator).body;
	const status = html.match(/<[^>]*role="status"[^>]*>([\s\S]*?)<\//);
	assert.ok(status);
	assert.equal(status[1].replace(/<!--.*?-->/g, '').trim(), loading ? 'Loading' : '');
	if (loading) assert.match(html, /<div[^>]*aria-hidden="true"/);
});
