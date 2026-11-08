import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { ComponentProps } from 'svelte';
import MarketsPanel from './MarketsPanel.svelte';

it.each([
	[null, '—'],
	[1234.56, '$1,234.56'],
	[0, '-']
] as const)('market row volume %s renders %s', (volume, expected) => {
	const props: ComponentProps<typeof MarketsPanel> = {
		voiUsdStatus: null,
		voiUsdAsOf: null,
		tokenAnalytics: null,
		sortedMarketData: [
			{
				trading_pair_id: 22,
				exchange: 'Uniswap',
				pair: 'VOI/USDC',
				network: 'Base',
				price: 0.001,
				volume_24h: volume,
				tvl: 100,
				price_change_percentage_24h: 0,
				type: 'DEX',
				url: null,
				pool_url: null,
				lastUpdated: new Date('2026-10-30T00:00:00Z')
			}
		],
		searchQuery: '',
		onSearchQueryChange: vi.fn(),
		filterMarkets: vi.fn(),
		sort: { key: 'volume_24h', dir: 'desc' },
		selectedTradingPairId: null,
		onRowClick: vi.fn(),
		marketDataError: null,
		refreshData: vi.fn(),
		isRefreshing: false
	};
	const { body } = render(MarketsPanel, { props });
	const cells = [...body.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
	// The volume cell follows pair, exchange, price and TVL.
	expect(cells[4]?.[1].replace(/<!--[\s\S]*?-->/g, '').trim()).toBe(expected);
});

const row = (
	overrides: Partial<ComponentProps<typeof MarketsPanel>['sortedMarketData'][number]> = {}
) => ({
	trading_pair_id: 22,
	exchange: 'Uniswap',
	pair: 'VOI/USDC',
	network: 'Base',
	price: 0.001,
	volume_24h: 1234.56,
	tvl: 100,
	price_change_percentage_24h: 2,
	type: 'DEX',
	url: null,
	pool_url: 'https://example.com/pool',
	lastUpdated: new Date('2026-10-30T00:00:00Z'),
	...overrides
});

function panel(overrides: Partial<ComponentProps<typeof MarketsPanel>> = {}) {
	return render(MarketsPanel, {
		props: {
			voiUsdStatus: null,
			voiUsdAsOf: null,
			tokenAnalytics: null,
			sortedMarketData: [row()],
			searchQuery: '',
			onSearchQueryChange: vi.fn(),
			filterMarkets: vi.fn(),
			selectedTradingPairId: 22,
			onRowClick: vi.fn(),
			marketDataError: null,
			refreshData: vi.fn(),
			isRefreshing: false,
			fetchingMarketData: false,
			...overrides
		}
	}).body;
}

it('names the caption, filter, clear action and shown population', () => {
	const body = panel({ searchQuery: 'voi' });
	expect(body).toMatch(/<caption\b[^>]*>Token markets<\/caption>/);
	expect(body).toMatch(/<label\b[^>]*for="market-search"[^>]*>Filter markets<\/label>/);
	expect(body).toMatch(/<button\b[^>]*aria-label="Clear market filter"/);
	expect(body).toContain('Shown markets');
});

it('exposes default sort and every sort key in a named mobile control', () => {
	const body = panel();
	expect(body).toMatch(/<th\b[^>]*aria-sort="descending"[^>]*>[\s\S]*?TVL \(USD\)/);
	expect(body).toMatch(/<label\b[^>]*for="market-sort"[^>]*>Sort markets<\/label>/);
	const select = body.match(/<select\b[^>]*id="market-sort"[^>]*>([\s\S]*?)<\/select>/)?.[1];
	for (const key of ['price', 'tvl', 'volume_24h']) {
		for (const dir of ['asc', 'desc']) expect(select).toContain(`value="${key}:${dir}"`);
	}
});

it('sorts by TVL descending with stable ties and missing values last', () => {
	const body = panel({
		sortedMarketData: [
			row({ pair: 'LOW/USDC', tvl: 1 }),
			row({ pair: 'NULL/USDC', tvl: null }),
			row({ pair: 'HIGH/USDC', tvl: 1000 }),
			row({ pair: 'TIE/USDC', tvl: 1000 })
		]
	});
	const pairs = [...body.matchAll(/aria-label="Show ([^"]+) chart"/g)].map((match) => match[1]);
	expect(pairs).toEqual(['HIGH/USDC', 'TIE/USDC', 'LOW/USDC', 'NULL/USDC']);
});

it.each(['price', 'tvl', 'volume_24h'])(
	'sorts %s numerically in both directions with nulls last',
	(key) => {
		for (const dir of ['asc', 'desc'] as const) {
			const body = panel({
				sort: { key, dir },
				sortedMarketData: [
					row({ pair: 'HIGH/USDC', [key]: 10 }),
					row({ pair: 'NULL/USDC', [key]: null }),
					row({ pair: 'LOW/USDC', [key]: 0 })
				]
			});
			const pairs = [...body.matchAll(/aria-label="Show ([^"]+) chart"/g)].map((match) => match[1]);
			expect(pairs).toEqual(
				dir === 'asc'
					? ['LOW/USDC', 'HIGH/USDC', 'NULL/USDC']
					: ['HIGH/USDC', 'LOW/USDC', 'NULL/USDC']
			);
		}
	}
);

it('keeps named chart selection, safe pool links and new-tab context', () => {
	const body = panel();
	expect(body).toMatch(/<button\b[^>]*aria-label="Show VOI\/USDC chart"[^>]*aria-pressed="true"/);
	const link = body.match(/<a\b[^>]*href="https:\/\/example.com\/pool"[^>]*>[\s\S]*?<\/a>/)?.[0];
	expect(link).toContain('target="_blank"');
	expect(link).toContain('rel="noopener noreferrer"');
	expect(link).toContain('opens in a new tab');
	expect(panel({ selectedTradingPairId: null })).toMatch(
		/aria-label="Show VOI\/USDC chart"[^>]*aria-pressed="false"/
	);
});

it("marks each row's chart button so a click on the row can press it", () => {
	expect(panel()).toMatch(/<button\b[^>]*aria-label="Show VOI\/USDC chart"[^>]*data-market-chart/);
});
it('connects responsive details to unique exchange, network and pair identities', () => {
	const body = panel({
		sortedMarketData: [row(), row({ exchange: 'PactFi', network: 'Algorand' })]
	});
	const controls = [...body.matchAll(/aria-controls="([^"]+)"[^>]*>[\s\S]*?Details for/g)].map(
		(match) => match[1]
	);
	expect(controls).toHaveLength(2);
	expect(new Set(controls).size).toBe(2);
	for (const id of controls) {
		expect(body).toContain(`id="${id}" hidden`);
	}
	const details = [...body.matchAll(/<dl\b[^>]*>([\s\S]*?)<\/dl>/g)];
	expect(details).toHaveLength(2);
	for (const detail of details) {
		for (const label of ['Exchange', 'Price', 'TVL (USD)', '24h Volume', '24h Change'])
			expect(detail[1]).toContain(label);
	}
});

it.each([
	[{}, 'No markets available.'],
	[{ searchQuery: 'missing' }, 'No markets match this filter.'],
	[{ fetchingMarketData: true }, 'Loading Token markets'],
	[{ marketDataError: 'offline' }, 'Unable to load Token markets.']
])('distinguishes table state %j', (state, message) => {
	const body = panel({ sortedMarketData: [], ...state });
	expect(body).toContain(message);
	if ('fetchingMarketData' in state) expect(body).toContain('aria-busy="true"');
	if ('marketDataError' in state) expect(body).toMatch(/<button\b[^>]*>[\s\S]*?Retry/);
});

it('announces refresh and preserves only the supplied retained rows', () => {
	const body = panel({ fetchingMarketData: true, isRefreshing: true });
	expect(body).toMatch(/role="status"[^>]*>Updating markets/);
	expect(body).toContain('Show VOI/USDC chart');
	expect(panel({ fetchingMarketData: true, sortedMarketData: [] })).not.toContain(
		'Show VOI/USDC chart'
	);
});

it.each([
	[{ voiUsdStatus: 'stale', voiUsdAsOf: '2026-10-30T00:00:00Z' }, 'VOI/USD reference is stale'],
	[{ voiUsdStatus: 'unavailable' }, 'VOI/USD reference unavailable'],
	[{ voiUsdStatus: 'invalid' }, 'VOI/USD reference unavailable'],
	[{ tokenAnalytics: { partial: true } }, 'Some analytics are unavailable.']
] as const)('presents reference and partial notices as warnings %j', (state, message) => {
	const body = panel(state as Partial<ComponentProps<typeof MarketsPanel>>);
	expect(body).toMatch(/role="alert"[^>]*class="[^"]*text-warn/);
	expect(body).toContain(message);
});

it.each([
	[2, 'text-ok', '+2.00%'],
	[-2, 'text-danger', '-2.00%'],
	[0, 'text-ink-muted', '0.00%'],
	[null, 'text-ink-muted', '-']
] as const)('keeps signed change %s in its semantic color', (change, color, label) => {
	const body = panel({ sortedMarketData: [row({ price_change_percentage_24h: change })] });
	expect(body).toContain(`class="${color}">${label}</span>`);
});

it('presses exactly the visible chart source and clears it on Back', async () => {
	const { pickMarket, resetChartSelection, visibleChart } = await import(
		'$lib/markets/chartSelection'
	);
	const market = { ...row(), base_token_id: 0, quote_token_id: 2 };
	const token = { data: [], volumes: [], loading: false, error: '', show: true };
	const selected = pickMarket(resetChartSelection(0), market);
	const view = visibleChart(selected, token);
	expect(panel({ selectedTradingPairId: view.selectedTradingPairId })).toMatch(
		/aria-label="Show VOI\/USDC chart"[^>]*aria-pressed="true"/
	);
	const back = visibleChart(resetChartSelection(selected.tokenId), token);
	expect(panel({ selectedTradingPairId: back.selectedTradingPairId })).toMatch(
		/aria-label="Show VOI\/USDC chart"[^>]*aria-pressed="false"/
	);
});
