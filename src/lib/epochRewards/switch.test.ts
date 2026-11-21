import { expect, test, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import type { ChainStatus } from '$lib/stores/chainStatus';
import { config } from '$lib/config';
import { epochHomeData, headerEpoch, liveEpoch } from '$lib/epochRewards';
import { loadHome } from '$lib/server/home';
import Layout from '../../routes/(site)/+layout.svelte';
import Page from '../../routes/(site)/+page.svelte';
import { homeData } from './home/fixture';

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
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

test('the home layout passes no epoch to the header badge', () => {
	const children = createRawSnippet(() => ({ render: () => '<p>Page content</p>' }));
	const html = render(Layout, { props: { children } }).body;
	expect(html).toContain('Block 5 live');
	expect(html).not.toContain('Epoch');
});

test('the header, the live clock and the home page get no epoch', () => {
	expect(headerEpoch(ready)).toBeUndefined();
	expect(epochHomeData(homeData(true))).toBeNull();
	expect(liveEpoch(new Date('2026-10-25T02:38:00Z'))).toBeUndefined();
});

test('the home load skips every epoch read and returns no epoch fields', async () => {
	const fetcher = vi.fn<typeof fetch>(async (input) => {
		const url = String(input);
		if (url.includes('/api/markets'))
			return Response.json({
				aggregates: { weightedAveragePrice: 0.000127 },
				marketData: [{ price_change_percentage_24h: -1 }]
			});
		if (url.includes('/api/mimir')) return Response.json({ data: 152 });
		if (url.includes('online-stake-history')) return Response.json([]);
		return Response.json({ max_timestamp: '2026-10-25T02:38:00Z' });
	});
	const data = await loadHome(
		new URL('https://voirewards.com/?epoch=103'),
		fetcher,
		new Date('2026-10-25T02:38:00Z')
	);
	const urls = fetcher.mock.calls.map(([url]) => String(url));
	expect(urls).not.toContain(config.proposalApiBaseUrl);
	expect(urls.filter((url) => url.includes('?start') || url.includes('/api/epochs'))).toEqual([]);
	expect(urls).toEqual([
		`${config.proposalApiBaseUrl}?action=online-stake-history`,
		'/api/markets?token=VOI',
		'/api/mimir?action=get_online_account_count'
	]);
	expect(Object.keys(data)).toEqual([
		'page',
		'chrome',
		'markets',
		'onlineStake',
		'price',
		'onlineCount'
	]);
	for (const key of [
		'headline',
		'rewards',
		'aprHistory',
		'currentStake',
		'currentEpoch',
		'rewardsEpoch'
	])
		expect(data).not.toHaveProperty(key);
	expect(await data.onlineCount).toEqual({ state: 'ready', value: 152 });
});

test('the home page shows the non-epoch tiles and cards, with no empty slot left behind', () => {
	const html = render(Page, { props: { data: homeData(false) } }).body.replace(
		/<!--[\s\S]*?-->/g,
		''
	);
	expect(html.match(/<h1\b/g)).toHaveLength(1);
	expect(html).toContain('role="search"');
	for (const text of ['Online stake', 'Online accounts', 'VOI price']) expect(html).toContain(text);
	for (const text of [
		'Staking APR',
		'APR by epoch',
		'Staking currently earns',
		"Who's earning",
		'Blocks this epoch',
		'Earning accounts',
		'Epoch'
	])
		expect(html).not.toContain(text);
	// The side cards take the full width; the three tiles share the row.
	expect(html).toMatch(
		/class="min-w-0 lg:col-span-12 md:col-span-2 grid md:grid-cols-2 gap-bento"/
	);
	expect(html.match(/class="grid min-w-0 md:col-span-\d lg:col-span-4"/g)).toHaveLength(3);
	// Each grid row fills, in tile order: at lg one row of 4 + 4 + 4; at md (two columns)
	// a row of 1 + 1, then the last tile across the full row.
	const spans = [...html.matchAll(/class="grid min-w-0 md:col-span-(\d) lg:col-span-(\d+)"/g)];
	expect(spans.map(([, md, lg]) => [Number(md), Number(lg)])).toEqual([
		[1, 4],
		[1, 4],
		[2, 4]
	]);
	expect(html).not.toContain('lg:col-span-3');
	expect(html).not.toMatch(/<section\b[^>]*>\s*<\/section>/);
	expect(html).not.toMatch(/<(div|section)\b[^>]*\bp-card\b[^>]*>\s*<\/\1>/);
	// No hero card is left in the overlap row.
	expect(html).not.toContain('p-card shadow-card on-hero');
	expect(html).toContain('Real-time block rewards');
	expect(html).toContain('Latest blocks');
	expect(html.indexOf('Real-time block rewards')).toBeLessThan(html.indexOf('Latest blocks'));
});

test('the design gallery leaves out the epoch stepper', async () => {
	const { default: Gallery } = await import('../../routes/ds/+page.svelte');
	const html = render(Gallery).body;
	expect(html).toContain('id="gallery-card"');
	expect(html).not.toContain('gallery-epoch-stepper');
	expect(html).not.toContain('gallery-epoch-current');
});
