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
		sortColumn: 'volume_24h',
		sortDirection: 'desc',
		sortData: vi.fn(),
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
