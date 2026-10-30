import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../__fixtures__/poolAggregates.json';
import { latestSwapRow, type PoolAggregate } from '$lib/server/poolAggregates';
import type { MarketPair } from './pairs';
import {
	composeDexMarketRow,
	legacyMarketRows,
	marketAggregates,
	sortByVolume,
	type RawTradingPair
} from './rows';

const pair: MarketPair = {
	baseTokenId: 0,
	baseSymbol: 'VOI',
	baseDecimals: 6,
	quoteTokenId: 302190,
	quoteSymbol: 'USDC',
	quoteDecimals: 8,
	poolId: 1,
	exchange: 'humble',
	tokenAId: 0,
	tokenASymbol: 'VOI',
	tokenADecimals: 6,
	tokenAType: 'VOI',
	tokenBId: 302190,
	tokenBSymbol: 'USDC',
	tokenBDecimals: 8,
	tokenBType: 'ARC200'
};

const aggregate: PoolAggregate = {
	...fixture.aggregates[0],
	latest_base_token_id: 302190,
	latest_quote_token_id: 0,
	latest_price_quote: 0.25,
	latest_poolbal_a: 10,
	latest_poolbal_b: 40
};

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('composeDexMarketRow', () => {
	it('inverts quote/base swaps and preserves the row fields and JSON key order', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
		const row = composeDexMarketRow(
			pair,
			latestSwapRow(aggregate),
			aggregate,
			new Map([
				['VOI', 0.02],
				['USDC', 1]
			])
		);
		expect(JSON.stringify(row)).toBe(
			JSON.stringify({
				trading_pair_id: 1,
				exchange: 'humble',
				pair: 'VOI/USDC',
				type: 'DEX',
				network: 'Voi',
				url: null,
				pool_url: 'https://voi.humble.sh/#/swap?poolId=1',
				base_token_id: 0,
				quote_token_id: 302190,
				base_decimals: 6,
				quote_decimals: 8,
				token_a_symbol: 'VOI',
				token_b_symbol: 'USDC',
				token_a_decimals: 6,
				token_b_decimals: 8,
				price: 4,
				volume_24h: 30,
				tvl: 40.2,
				high_24h: null,
				low_24h: null,
				price_change_24h: null,
				price_change_percentage_24h: ((4 - 3) / 3) * 100,
				lastUpdated: '2026-10-25T00:00:00.000Z'
			})
		);
	});

	it.each([
		['VOI', 2, 40],
		['USDC', 3, 240]
	] as const)(
		'derives the other TVL side from reserves when only %s is priced',
		(symbol, price, tvl) => {
			const row = composeDexMarketRow(
				pair,
				latestSwapRow(aggregate),
				aggregate,
				new Map([[symbol, price]])
			);
			expect(row.tvl).toBe(tvl);
		}
	);

	it.each([
		['VOI', 2, 10, 0, 40],
		['USDC', 3, 0, 40, 240]
	] as const)(
		'doubles the %s TVL side when the other reserve is absent',
		(symbol, price, a, b, tvl) => {
			const agg = { ...aggregate, latest_poolbal_a: a, latest_poolbal_b: b };
			const row = composeDexMarketRow(pair, latestSwapRow(agg), agg, new Map([[symbol, price]]));
			expect(row.tvl).toBe(tvl);
		}
	);

	it('returns null price change when the first price is zero', () => {
		const agg = { ...aggregate, first_24h_price_quote: 0 };
		const row = composeDexMarketRow(pair, latestSwapRow(agg), agg, new Map());
		expect(row.price_change_percentage_24h).toBeNull();
	});
});

describe('market row processing', () => {
	const source = { network: 'Voi', exchange: 'humble' };

	it('counts repeated pools once for volume, TVL, and weighted price', () => {
		expect(
			JSON.stringify(
				marketAggregates([
					{
						...source,
						trading_pair_id: 1,
						volume_24h: 10,
						tvl: 100,
						price: 2
					},
					{
						...source,
						trading_pair_id: 1,
						volume_24h: 10,
						tvl: 100,
						price: 2
					},
					{
						...source,
						trading_pair_id: 2,
						volume_24h: 30,
						tvl: 200,
						price: 4
					}
				])
			)
		).toBe(JSON.stringify({ totalVolume: 40, totalTvl: 300, weightedAveragePrice: 3.5 }));
	});

	it.each([
		{ network: 'Algorand', exchange: 'humble' },
		{ network: 'Voi', exchange: 'pactfi' }
	])('counts the same pool id separately for source %j', (otherSource) => {
		expect(
			marketAggregates([
				{
					...source,
					trading_pair_id: 1,
					volume_24h: 10,
					tvl: 100,
					price: 2
				},
				{ ...otherSource, trading_pair_id: 1, volume_24h: 30, tvl: 200, price: 4 }
			])
		).toEqual({ totalVolume: 40, totalTvl: 300, weightedAveragePrice: 3.5 });
	});

	it('keeps a constant weighted price when duplicate pools are included', () => {
		expect(
			marketAggregates([
				{
					...source,
					trading_pair_id: 1,
					volume_24h: 10,
					tvl: 100,
					price: 4
				},
				{
					...source,
					trading_pair_id: 1,
					volume_24h: 10,
					tvl: 100,
					price: 4
				},
				{
					...source,
					trading_pair_id: 2,
					volume_24h: 30,
					tvl: 200,
					price: 4
				}
			]).weightedAveragePrice
		).toBe(4);
	});

	it('uses the first occurrence of a pool for all aggregates', () => {
		expect(
			marketAggregates([
				{
					...source,
					trading_pair_id: 1,
					volume_24h: 10,
					tvl: 100,
					price: 2
				},
				{
					...source,
					trading_pair_id: 1,
					volume_24h: 90,
					tvl: 900,
					price: 8
				},
				{
					...source,
					trading_pair_id: 2,
					volume_24h: 30,
					tvl: 200,
					price: 4
				}
			])
		).toEqual({ totalVolume: 40, totalTvl: 300, weightedAveragePrice: 3.5 });
	});

	it('treats a null price as zero in the weighted average', () => {
		expect(
			marketAggregates([
				{
					...source,
					trading_pair_id: 1,
					volume_24h: 10,
					tvl: null,
					price: null
				},
				{
					...source,
					trading_pair_id: 2,
					volume_24h: 30,
					tvl: 200,
					price: 4
				}
			])
		).toEqual({ totalVolume: 40, totalTvl: 200, weightedAveragePrice: 3 });
	});

	it('returns zero weighted price when total volume is zero', () => {
		expect(
			marketAggregates([
				{
					...source,
					trading_pair_id: 1,
					volume_24h: 0,
					tvl: 100,
					price: 4
				}
			])
		).toEqual({
			totalVolume: 0,
			totalTvl: 100,
			weightedAveragePrice: 0
		});
	});

	it('sorts by descending volume using a copy with identical row objects', () => {
		const rows = [{ volume_24h: 1 }, { volume_24h: 3 }, { volume_24h: null }];
		const sorted = sortByVolume(rows);
		expect(sorted).toEqual([rows[1], rows[0], rows[2]]);
		expect(sorted).not.toBe(rows);
		expect(sorted[0]).toBe(rows[1]);
		expect(rows.map((row) => row.volume_24h)).toEqual([1, 3, null]);
	});

	it('maps legacy snapshots and sorts by descending volume', () => {
		function legacy(id: number, volume: number): RawTradingPair {
			return {
				id,
				exchange_id: 7,
				base_token: 'VOI',
				quote_token: 'USDC',
				contract_address: null,
				pool_url: 'https://example.test/pool',
				created_at: fixture.now,
				updated_at: fixture.now,
				exchange: { name: 'legacy', type: 'DEX', network: 'Algorand' },
				market_snapshots: [
					{
						price: 2,
						volume_24h: volume,
						tvl: 100,
						high_24h: 3,
						low_24h: 1,
						price_change_24h: 1,
						price_change_percentage_24h: 100,
						timestamp: fixture.now
					}
				]
			};
		}
		const rows = legacyMarketRows([legacy(1, 10), legacy(2, 30)]);
		expect(rows.map((row) => row.trading_pair_id)).toEqual([2, 1]);
		// TASK-88: a retired exchange's trading pair is dropped even with the most volume.
		const nomadex = {
			...legacy(3, 50),
			exchange: { name: 'Nomadex', type: 'DEX', network: 'Voi' }
		};
		expect(legacyMarketRows([legacy(1, 10), nomadex]).map((row) => row.trading_pair_id)).toEqual([
			1
		]);
		expect(JSON.stringify(rows[0])).toBe(
			JSON.stringify({
				trading_pair_id: 2,
				exchange: 'legacy',
				pair: 'USDC/VOI',
				type: 'DEX',
				network: 'Algorand',
				url: null,
				pool_url: 'https://example.test/pool',
				price: 2,
				volume_24h: 30,
				tvl: 100,
				high_24h: 3,
				low_24h: 1,
				price_change_24h: 1,
				price_change_percentage_24h: 100,
				lastUpdated: new Date(fixture.now).toLocaleString()
			})
		);
	});
});
