import { expect, test, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import type { ChainStatus } from '$lib/stores/chainStatus';
import { config } from '$lib/config';
import { epochAt, headerEpoch, liveEpoch } from '$lib/epochRewards';
import { loadHome } from '$lib/server/home';
import Layout from '../../routes/(site)/+layout.svelte';
import Page from '../../routes/(site)/+page.svelte';
import { epochHomeData } from '$lib/epochRewards';
import { homeData } from './home/fixture';

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
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

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

test('the home load starts its reads and orders its payload as before', async () => {
	const now = new Date('2026-10-25T02:38:00Z');
	const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
	void loadHome(new URL('https://voirewards.com/?epoch=103'), fetcher, now);
	expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
		config.proposalApiBaseUrl,
		`${config.proposalApiBaseUrl}?start=2026-10-21&end=2026-10-27`,
		`${config.proposalApiBaseUrl}?start=2026-10-14&end=2026-10-20`,
		'/api/epochs',
		`${config.proposalApiBaseUrl}?action=online-stake-history`,
		'/api/markets?token=VOI',
		'/api/mimir?action=get_online_account_count'
	]);
	const failing = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
	const data = await loadHome(new URL('https://voirewards.com/'), failing, now);
	expect(Object.keys(data)).toEqual([
		'page',
		'chrome',
		'currentEpoch',
		'rewardsEpoch',
		'markets',
		'headline',
		'rewards',
		'aprHistory',
		'currentStake',
		'onlineStake',
		'price',
		'onlineCount'
	]);
});

test('the home page fills every epoch slot', () => {
	const html = render(Page, { props: { data: homeData(true) } }).body.replace(
		/<!--[\s\S]*?-->/g,
		''
	);
	for (const text of [
		"Who's earning this epoch",
		'Staking APR · epoch 104',
		'APR by epoch',
		'Staking currently earns',
		'Blocks this epoch',
		'Earning accounts',
		'Online stake',
		'VOI price'
	])
		expect(html).toContain(text);
	expect(html).not.toContain('Online accounts<');
	expect(html).toMatch(/class="min-w-0 lg:col-span-4 md:col-span-2 flex flex-col gap-bento"/);
	expect(html.match(/class="grid min-w-0 md:col-span-1 lg:col-span-3"/g)).toHaveLength(4);
	expect(html).not.toContain('lg:col-span-12');
});

test('the epoch fields are handed on as the payload references, not copies', () => {
	const data = homeData(true);
	const epoch = epochHomeData(data)!;
	expect(epoch.rewards).toBe(data.rewards);
	expect(epoch.headline).toBe(data.headline);
	expect(epochHomeData(homeData(false))).toBeNull();
});
