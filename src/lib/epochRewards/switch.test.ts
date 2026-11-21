import { expect, test, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import type { ChainStatus } from '$lib/stores/chainStatus';
import { headerEpoch, liveEpoch } from '$lib/epochRewards';
import FreshnessBadge from '$lib/ds/Header/FreshnessBadge.svelte';
import Layout from '../../routes/(site)/+layout.svelte';

// The switch-off state: every epoch surface must disappear, nothing else.
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

test('the hero badge shows the block, never an epoch', () => {
	const body = render(FreshnessBadge, { props: { variant: 'hero' } }).body;
	expect(body).toContain('Block 5 live');
	expect(body).not.toContain('Epoch');
});

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
