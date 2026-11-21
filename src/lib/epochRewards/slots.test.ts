import { expect, test, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import type { ChainStatus } from '$lib/stores/chainStatus';
import { epochAt, headerEpoch, liveEpoch } from '$lib/epochRewards';
import Layout from '../../routes/(site)/+layout.svelte';

// The switch-on state, unmocked: each epoch slot is filled as before.
const { live, ready } = vi.hoisted(() => {
	const minute = 60_000;
	const live: ChainStatus = {
		round: 5,
		lastRoundAt: 10 * minute,
		lastChangeAt: 10 * minute,
		error: false,
		checkedAt: 10 * minute,
		startedAt: 0
	};
	const ready = { chrome: 'hero', headline: { state: 'ready', value: { epoch: 104 } } };
	return { live, ready };
});
vi.mock('$lib/stores/chainStatus', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/stores/chainStatus')>()),
	chainStatus: readable(live)
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://example.com/'), data: ready }
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

test('the home layout passes the headline epoch to the header badge', () => {
	const children = createRawSnippet(() => ({ render: () => '<p>Page content</p>' }));
	const html = render(Layout, { props: { children } }).body;
	expect(html).toContain('Epoch 104 live · block 5');
});

test('the header epoch needs a ready headline; the live clock follows the calendar', () => {
	expect(headerEpoch(ready)).toBe(104);
	expect(headerEpoch({ headline: { state: 'error', message: 'offline' } })).toBeUndefined();
	expect(headerEpoch(undefined)).toBeUndefined();
	const now = new Date('2026-10-25T02:38:00Z');
	expect(liveEpoch(now)).toBe(epochAt(now));
});
