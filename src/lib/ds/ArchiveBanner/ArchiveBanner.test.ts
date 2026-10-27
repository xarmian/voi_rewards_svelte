import { test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import ArchiveBanner from './ArchiveBanner.svelte';
test('named archive landmark with dates and hub link, never dismissible', () => {
	const html = render(ArchiveBanner, {
		props: { programme: 'Phase 2 testnet', endedOn: 'Nov 2025', frozenAt: 'Nov 30, 2025' }
	}).body.replace(/\s+/g, ' ');
	assert.match(html, /<section[^>]*aria-label="Archive notice"/);
	assert.match(
		html,
		/Read-only archive\.[\s\S]*Phase 2 testnet ended Nov 2025\.[\s\S]*Data is frozen as of Nov 30, 2025\./
	);
	assert.match(html, /href="\/archive\/testnet"[^>]*>All archived programmes/);
	assert.match(html, /aria-hidden="true">!/);
	assert.doesNotMatch(html, /<button/);
});
test('optional dates omit their clauses', () => {
	const html = render(ArchiveBanner, {
		props: { programme: 'Test programme', hubHref: '/archive' }
	}).body.replace(/\s+/g, ' ');
	assert.match(html, /Test programme has ended\./);
	assert.doesNotMatch(html, /Data is frozen|undefined/);
	assert.match(html, /href="\/archive"/);
});
