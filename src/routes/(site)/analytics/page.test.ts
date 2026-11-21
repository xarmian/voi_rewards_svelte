import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { derived, get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import Page from './+page.svelte';
import { createNetwork } from '$lib/network/model';
import { epochAnalytics } from '$lib/epochRewards/client';
import epochs from '$lib/network/fixtures/epochs.json';
import stake from '$lib/network/fixtures/online-stake-history.json';
import prices from '$lib/network/fixtures/price-history-7d.json';
import transactions from '$lib/network/fixtures/tx-counts-day-30.json';
import { MISSING } from '$lib/ds/format';
import { loadNetworkBlockRewardsDaily, type NetworkBlockRewardDay } from '$lib/wallet/blockRewards';
import type { Source } from '$lib/wallet/read';

const plots = vi.hoisted(() => ({
	points: [] as { x: unknown; y: number }[][],
	scales: [] as (string | undefined)[]
}));
vi.mock('$lib/network/model', async (original) => {
	const actual = await original<typeof import('$lib/network/model')>();
	return { ...actual, createNetwork: vi.fn(actual.createNetwork) };
});
vi.mock('$lib/epochRewards/client', async (original) => {
	const actual = await original<typeof import('$lib/epochRewards/client')>();
	return { ...actual, epochAnalytics: vi.fn(actual.epochAnalytics) };
});
vi.mock('$lib/ds/charts/LineChart.svelte', async (original) => {
	const actual = await original<typeof import('$lib/ds/charts/LineChart.svelte')>();
	return {
		default: (...args: Parameters<typeof actual.default>) => {
			plots.points.push(args[1].points);
			return actual.default(...args);
		}
	};
});
vi.mock('$lib/ds/charts/scales', async (original) => {
	const actual = await original<typeof import('$lib/ds/charts/scales')>();
	return {
		...actual,
		makeY: (...args: Parameters<typeof actual.makeY>) => {
			plots.scales.push(args[2]);
			return actual.makeY(...args);
		}
	};
});

const blockRead = vi.hoisted(() => ({
	result: null as Source<unknown> | null,
	loads: [] as [string, boolean | undefined][]
}));
vi.mock('$lib/wallet/blockRewards', async (original) => ({
	...(await original<typeof import('$lib/wallet/blockRewards')>()),
	loadNetworkBlockRewardsDaily: vi.fn()
}));
vi.mock('$lib/wallet/read', async (original) => {
	const actual = await original<typeof import('$lib/wallet/read')>();
	return {
		...actual,
		createReadSource: <T>(
			read: (address: string, force: boolean) => Promise<T>,
			publish: (result: Source<T>) => void
		) => {
			if (!blockRead.result) return actual.createReadSource(read, publish);
			publish(blockRead.result as Source<T>);
			return {
				load: async (key: string, force?: boolean) => {
					blockRead.loads.push([key, force]);
				},
				dispose: () => {}
			};
		}
	};
});

const BLOCK_TITLE = 'Real-time block rewards by day';
const blockDay = (
	day: string,
	over: Partial<NetworkBlockRewardDay> = {}
): NetworkBlockRewardDay => ({
	day,
	blocks: 30_000,
	rewardedBlocks: 1_234,
	amount: 2_500_000_000,
	feesCollected: 0,
	lastRound: null,
	...over
});
const blockDays = [
	blockDay('2026-11-04', { blocks: 0, rewardedBlocks: 0, amount: 0 }),
	blockDay('2026-11-05'),
	blockDay('2026-11-06', { amount: 1_000_000_000 })
];
const visible = (html: string) =>
	html
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const now = Date.parse('2026-11-06T12:00:00Z');
function setup(overrides: { price?: unknown; tx?: unknown; fail?: string } = {}) {
	const fetcher = vi.fn<typeof fetch>(async (url) => {
		const path = String(url);
		if (overrides.fail && path.includes(overrides.fail))
			return new Response('Unavailable', { status: 503 });
		if (path === '/api/epochs') return Response.json(epochs);
		if (path.includes('online-stake-history')) return Response.json(stake);
		if (path === '/api/price-history?period=7d') return Response.json(overrides.price ?? prices);
		if (path.startsWith('/api/mimir?action=get_tx_counts'))
			return Response.json(overrides.tx ?? transactions);
		throw new Error(`Unexpected request ${path}`);
	});
	// The page's two models on one fetcher, read as one: the epoch read starts first, as on the page.
	const network = createNetwork({ fetch: fetcher, now: () => now });
	const epochModel = epochAnalytics({ fetch: fetcher, now: () => now })!;
	const model = {
		network,
		epochModel,
		subscribe: derived([network, epochModel], ([n, e]) => ({
			...n,
			epochs: e.epochs,
			range: e.range,
			announcement: e.announcement
		})).subscribe,
		load: () => Promise.all([epochModel.load(), network.load()]),
		retry: (key: 'epochs' | Parameters<typeof network.retry>[0]) =>
			key === 'epochs' ? epochModel.retry() : network.retry(key),
		setRange: epochModel.setRange,
		setPeriod: network.setPeriod
	};
	return { model, fetcher };
}
function section(html: string, title: string) {
	return (
		[...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)]
			.map((m) => m[0])
			.find((s) => s.includes(`>${title}</h2>`)) ?? ''
	);
}
const htmlFor = (model: ReturnType<typeof setup>['model']) => {
	vi.mocked(createNetwork).mockReturnValueOnce(model.network);
	vi.mocked(epochAnalytics).mockReturnValueOnce(model.epochModel);
	return render(Page).body.replace(/<!--[\s\S]*?-->/g, '');
};

afterEach(() => {
	blockRead.result = null;
	blockRead.loads = [];
	vi.mocked(loadNetworkBlockRewardsDaily).mockClear();
	plots.points = [];
	plots.scales = [];
	vi.restoreAllMocks();
});

it('renders the seven sections in reading order with no Relays element', async () => {
	const { model } = setup();
	await model.load();
	const html = htmlFor(model);
	expect(html).not.toMatch(/relays/i);
	const titles = [...html.matchAll(/<h2\b[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
	expect(titles).toEqual([
		'APR by epoch',
		'Online stake',
		BLOCK_TITLE,
		'Accounts earning by epoch',
		'Current stake split',
		'VOI price',
		'Transaction activity'
	]);
	expect(html).toContain('Block unavailable');
	expect(html.match(/>View data<\/summary>/g)).toHaveLength(6);
	expect(html).not.toContain('overflow-x-auto');
	expect(html).toContain('Retrieved 2026-11-06 12:00:00 UTC - source update time unavailable');
	expect(html).toContain('data as of 2026-11-06 02:50:25 UTC');
	expect(html).toContain('in progress');
	expect(html).toContain('Previous completed');
});

it('keeps the APR card ready when the price resource fails', async () => {
	const { model } = setup({ fail: 'price-history' });
	await model.load();
	const html = htmlFor(model);
	expect(get(model).epochs?.status).toBe('ready');
	expect(section(html, 'APR by epoch')).toContain('<svg');
	expect(section(html, 'APR by epoch')).not.toContain('Retry');
	expect(section(html, 'VOI price')).toContain("Couldn't load VOI price");
	expect(section(html, 'VOI price')).toContain('Retry');
});

it('sends only positive finite observations and missing gaps to the logarithmic price plot', async () => {
	const { model } = setup({
		price: [
			...prices,
			{ time: prices[0].time, value: 0 },
			{ time: prices[0].time, value: -1 },
			{ time: '2026-11-07T00:00:00Z', value: null }
		]
	});
	await model.load();
	const html = htmlFor(model);
	expect(plots.scales).toContain('log');
	const points = plots.points[3];
	expect(points).toBeDefined();
	expect(points.filter((p) => Number.isFinite(p.y)).every((p) => p.y > 0)).toBe(true);
	expect(points.some((p) => Number.isNaN(p.y))).toBe(true);
	expect(section(html, 'VOI price')).toContain('logarithmic');
	expect(section(html, 'VOI price')).toContain('daily UTC mean');
	expect(section(html, 'VOI price')).toContain('href="/markets"');
});

it('changes only the APR range locally and announces a changed selection once', async () => {
	const { model, fetcher } = setup();
	await model.load();
	expect(get(model).range).toBe('26');
	const announcements: string[] = [];
	let last = '';
	const unsubscribe = model.subscribe((state) => {
		if (state.announcement !== last) {
			last = state.announcement;
			announcements.push(last);
		}
	});
	model.setRange('12');
	model.setRange('12');
	const html = htmlFor(model);
	expect(announcements).toEqual(['APR range: last 12 epochs.']);
	expect(html.match(/APR range: last 12 epochs\./g)).toHaveLength(1);
	expect(
		section(html, 'APR by epoch')
			.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0]
			.match(/<tr/g)
	).toHaveLength(12);
	expect(
		section(html, 'Accounts earning by epoch')
			.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0]
			.match(/<tr/g)
	).toHaveLength(26);
	expect(html).toMatch(/role="group" aria-label="APR epoch range"/);
	expect(html).toMatch(/aria-pressed="true"[^>]*>12<\/button>/);
	expect(fetcher).toHaveBeenCalledTimes(4);
	unsubscribe();
});

it('places the curated offline event on the plot and repeats its text outside SVG', async () => {
	const { model } = setup();
	await model.load();
	const html = section(htmlFor(model), 'Online stake');
	expect(html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0]).toContain('~243M VOI went offline');
	expect(html.replace(/<svg\b[\s\S]*?<\/svg>/g, '')).toContain('Oct 8-12: ~243M VOI went offline');
});

it('renders a legitimate zero tx bucket as 0 and a failed response as an error', async () => {
	const good = setup({ tx: { data: [{ bucket_start: '2026-11-05T00:00:00', tx_count: 0 }] } });
	await good.model.load();
	const html = section(htmlFor(good.model), 'Transaction activity');
	expect(html).toMatch(/<td[^>]*>0<\/td>/);
	expect(html).not.toContain("Couldn't load");
	const failed = setup({ fail: 'get_tx_counts' });
	await failed.model.load();
	const error = section(htmlFor(failed.model), 'Transaction activity');
	expect(error).toContain("Couldn't load Transaction activity.");
	expect(error).toContain('Retry');
	expect(error).not.toContain('<svg');
	expect(error).not.toMatch(/<td[^>]*>0<\/td>/);
});

it('shows actual totals and a dashed, labelled full-period projection in chart and table', async () => {
	const { model } = setup();
	await model.load();
	const html = section(htmlFor(model), 'Transaction activity');
	expect(html).toContain('stroke-dasharray="6 4"');
	expect(html).toContain('projected full day');
	expect(html).toContain('Actual transactions');
	expect(html).toMatch(/<td[^>]*>690<\/td>/);
	expect(html).toMatch(/<td[^>]*>1380<\/td>/);
	await model.setPeriod('week');
	expect(section(htmlFor(model), 'Transaction activity')).toContain('projected full week');
});

it('retries only the failed resource and retains original stale metadata', async () => {
	const { model, fetcher } = setup();
	await model.load();
	const original = get(model).price;
	fetcher.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
	await model.retry('price');
	expect(get(model).price).toEqual({ ...original, status: 'stale' });
	const html = section(htmlFor(model), 'VOI price');
	expect(html).toContain('Stale - data as of');
	expect(html).toContain('Retry');
	expect(fetcher.mock.calls.slice(4).map(([url]) => url)).toEqual(['/api/price-history?period=7d']);
});

it('finishes APR loading while another resource remains pending', async () => {
	const { model, fetcher } = setup();
	const fixtureFetch = fetcher.getMockImplementation()!;
	fetcher.mockImplementation((url, init) =>
		String(url).includes('price-history') ? new Promise(() => {}) : fixtureFetch(url, init)
	);
	void model.load();
	for (let i = 0; i < 40; i++) await Promise.resolve();
	const html = htmlFor(model);
	expect(section(html, 'APR by epoch')).toContain('<svg');
	expect(section(html, 'VOI price')).toContain('aria-busy="true"');
	expect(section(html, 'VOI price')).toContain('height: 230px');
	expect(section(html, 'VOI price')).not.toMatch(/<td[^>]*>0<\/td>/);
});

it('uses unavailable and empty states for absent account counts and an invalid split', async () => {
	const { model, fetcher } = setup();
	fetcher.mockResolvedValueOnce(
		Response.json({
			current_epoch: 106,
			epochs: [{ ...epochs.epochs.at(-1), participating_wallets: null, ballast_stake: null }]
		})
	);
	await model.load();
	const html = htmlFor(model);
	expect(section(html, 'Accounts earning by epoch')).toContain('No observations in this range');
	expect(section(html, 'Current stake split')).toContain('Unavailable');
	expect(section(html, 'Current stake split').replace(/<[^>]*>/g, ' ')).not.toMatch(/\bnone\b/i);
});

it('binds segmented controls to the tested range and period handlers with 44px targets', () => {
	const page = ['./+page.svelte', '../../../lib/epochRewards/analytics/EpochAprChart.svelte']
		.map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
		.join('\n');
	expect(page).toContain('onchange={model.setRange}');
	expect(page).toContain('onchange={model.setPeriod}');
	expect(page).toContain('min-height: 44px');
});

it('server-renders the daily block reward chart as loading after online stake without a read', async () => {
	const { model } = setup();
	await model.load();
	const html = htmlFor(model);
	const titles = [...html.matchAll(/<h2\b[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
	expect(titles.indexOf(BLOCK_TITLE)).toBe(titles.indexOf('Online stake') + 1);
	const block = section(html, BLOCK_TITLE);
	expect(block).toContain('aria-busy="true"');
	expect(block).toContain(`Loading ${BLOCK_TITLE}`);
	expect(loadNetworkBlockRewardsDaily).not.toHaveBeenCalled();
});

it('tabulates and plots ready daily block rewards with a missing share for a day with no blocks', async () => {
	blockRead.result = { state: 'ready', value: blockDays, asOf: now };
	const { model } = setup();
	await model.load();
	const block = section(htmlFor(model), BLOCK_TITLE);
	const headers = [...block.matchAll(/<th\b[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
	expect(headers).toEqual(['UTC date', 'Blocks', 'Blocks rewarded', 'Share rewarded', 'VOI']);
	const rows = [
		...(block.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '').matchAll(/<tr>([\s\S]*?)<\/tr>/g)
	].map((m) => [...m[1].matchAll(/<td\b[^>]*>([^<]*)<\/td>/g)].map((c) => c[1]));
	expect(rows).toEqual([
		['2026-11-04', '0', '0', MISSING, '0'],
		['2026-11-05', '30,000', '1,234', '4.1%', '2,500'],
		['2026-11-06', '30,000', '1,234', '4.1%', '1,000']
	]);
	expect(plots.points).toContainEqual([
		{ x: '2026-11-04', y: 0 },
		{ x: '2026-11-05', y: 2500 },
		{ x: '2026-11-06', y: 1000 }
	]);
	expect(block).toContain('<svg');
	expect(block).toContain('3 UTC days');
});

it('shows the daily block reward error state with a retry control', async () => {
	blockRead.result = { state: 'error', error: 'Request failed' };
	const { model } = setup();
	await model.load();
	const block = section(htmlFor(model), BLOCK_TITLE);
	expect(block).toContain(`Couldn't load ${BLOCK_TITLE}.`);
	expect(block).toContain('Retry');
	expect(block).not.toContain('<svg');
});

it('labels the daily block reward chart as testing without mentioning payouts', async () => {
	for (const result of [null, { state: 'ready', value: blockDays, asOf: now }] as const) {
		blockRead.result = result;
		const { model } = setup();
		await model.load();
		const text = visible(section(htmlFor(model), BLOCK_TITLE));
		expect(text).toContain('Testing');
		expect(text).not.toMatch(/payout/i);
	}
});
