import { expect, test, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import type { ChainStatus } from '$lib/stores/chainStatus';
import { headerEpoch, liveEpoch } from '$lib/epochRewards';
import Layout from '../../routes/(site)/+layout.svelte';

// The switch-off state: every epoch surface must disappear, nothing else.
// The badge's own clock epoch is set in onMount, which server rendering never runs, so
// it is covered through liveEpoch below rather than by rendering the badge.
vi.mock('$lib/epochRewards/config', () => ({ EPOCH_REWARDS_ENABLED: false }));
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

test('the home layout passes no epoch to the header badge', () => {
	const children = createRawSnippet(() => ({ render: () => '<p>Page content</p>' }));
	const html = render(Layout, { props: { children } }).body;
	expect(html).toContain('Block 5 live');
	expect(html).not.toContain('Epoch');
});

test('the header and the live clock report no epoch', () => {
	expect(headerEpoch(ready)).toBeUndefined();
	expect(liveEpoch(new Date('2026-10-25T02:38:00Z'))).toBeUndefined();
});
