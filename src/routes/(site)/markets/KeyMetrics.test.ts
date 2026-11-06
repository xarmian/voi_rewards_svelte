import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { ComponentProps } from 'svelte';
import KeyMetrics from './KeyMetrics.svelte';

type Props = ComponentProps<typeof KeyMetrics>;
const props: Props = {
	selectedToken: null,
	fetchingMarketData: false,
	totalVolume24h: 1234.56,
	totalTvlAll: 9876.54,
	circulatingMarketCap: 2468.12,
	tokenTotalSupplyAdjusted: 1000000,
	fullyDilutedMarketCap: 12345.67,
	realCirculatingSupply: { circulatingSupply: 2000000, percentDistributed: 20 },
	activeMarketsCount: 2,
	realMarketData: [{ exchange: 'Humble' }, { exchange: 'Humble' }, { exchange: 'Tinyman' }]
};
const html = (overrides: Partial<Props> = {}) =>
	render(KeyMetrics, { props: { ...props, ...overrides } }).body.replace(/<!--[\s\S]*?-->/g, '');
const text = (body: string) =>
	body
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

it('preserves formatted VOI metrics, supply and the independent active-market count', () => {
	const body = html();
	for (const value of [
		'$1,234.56',
		'$9,876.54',
		'$2,468.12',
		'Market Cap',
		'Circulating: 2,000,000'
	]) {
		expect(body).toContain(value);
	}
	expect(text(body)).toContain('Active markets 2');
	expect(body).toContain('Across 2 exchanges');
	expect(body).not.toContain('FDV');
});

it('uses FDV and total supply for other tokens without changing formatted values', () => {
	const body = html({
		selectedToken: {
			id: 1,
			symbol: 'UNIT',
			decimals: 6,
			type: 'ARC200',
			poolCount: 2,
			imageUrl: null
		}
	});
	expect(body).toContain('FDV');
	expect(body).toContain('$12,345.67');
	expect(body).toContain('Total Supply: 1,000,000');
	expect(body).not.toContain('Market Cap');
});

it('keeps unavailable circulating supply and market cap as em dashes', () => {
	const body = html({ realCirculatingSupply: null, circulatingMarketCap: null });
	expect(body).toMatch(/Circulating:\s*—/);
	expect(body).toMatch(/Market Cap[\s\S]*?—/);
	expect(body).not.toContain('$0.00');
});

it('keeps unavailable token supply as an em dash and FDV as a hyphen', () => {
	const body = html({
		selectedToken: {
			id: 1,
			symbol: 'UNIT',
			decimals: 6,
			type: 'ARC200',
			poolCount: 2,
			imageUrl: null
		},
		tokenTotalSupplyAdjusted: null
	});
	expect(body).toMatch(/Total Supply:\s*—/);
	expect(text(body)).toContain('FDV -');
});

it('announces loading for all four metrics instead of exposing stale numeric values', () => {
	const body = html({ fetchingMarketData: true });
	expect(body.match(/aria-busy="true"/g)).toHaveLength(4);
	for (const label of ['24h Volume', 'Total TVL', 'Market Cap', 'Active markets']) {
		expect(body).toContain(`Loading ${label}`);
	}
	expect(body).not.toContain('$1,234.56');
});

it('preserves unavailable aggregates and zero values as distinct states', () => {
	const missing = html({ totalVolume24h: null, totalTvlAll: null, activeMarketsCount: null });
	expect(missing.match(/—/g)).toHaveLength(3);
	const zero = html({ totalVolume24h: 0, totalTvlAll: 0, activeMarketsCount: 0 });
	expect(zero.match(/\$0\.00/g)).toHaveLength(2);
	expect(text(zero)).toContain('Active markets 0');
});
