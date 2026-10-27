import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import Gallery from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

test('gallery search landmark names and all markup ids are unique', () => {
	const html = render(Gallery).body;
	const forms = [...html.matchAll(/<form\b[^>]*role="search"[^>]*>/g)].map((m) => m[0]);
	assert.equal(forms.length, 4);
	const labels = forms.map((form) => form.match(/aria-label="([^"]+)"/)?.[1]);
	assert.ok(labels.every(Boolean));
	assert.equal(new Set(labels).size, labels.length);
	assert.ok(labels.includes('Gallery wallet search'));
	const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
	assert.equal(new Set(ids).size, ids.length);
});
