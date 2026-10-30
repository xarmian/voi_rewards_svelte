import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('accordion header slots contain only non-interactive question content', () => {
	const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
	const headers = [
		...source.matchAll(/<svelte:fragment slot="header">([\s\S]*?)<\/svelte:fragment>/g)
	];
	assert.equal(headers.length, 2);
	for (const [, header] of headers) {
		assert.doesNotMatch(header, /<a\b|<button\b|role="button"/);
	}
	assert.equal((source.match(/aria-label="Copy link to this question"/g) ?? []).length, 2);
});
