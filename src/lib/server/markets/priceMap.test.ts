import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../__fixtures__/poolAggregates.json';
import type { PoolAggregate } from '$lib/server/poolAggregates';
import type { MarketPair } from './pairs';
import { latestSwapsByPool, resolveSymbolUsd, vestigePriceMap } from './priceMap';

function pair(
	poolId: number,
	tokenAId: number,
	tokenASymbol: string,
	tokenBId: number,
	tokenBSymbol: string
): MarketPair {
	return {
		baseTokenId: tokenAId,
		baseSymbol: tokenASymbol,
		baseDecimals: 6,
		quoteTokenId: tokenBId,
		quoteSymbol: tokenBSymbol,
		quoteDecimals: 6,
		poolId,
		exchange: 'humble',
		tokenAId,
		tokenASymbol,
		tokenADecimals: 6,
		tokenAType: 'ARC200',
		tokenBId,
		tokenBSymbol,
		tokenBDecimals: 6,
		tokenBType: 'VOI'
	};
}

function aggregate(pair: MarketPair, price: number): PoolAggregate {
	return {
		...fixture.aggregates[0],
		pool_id: pair.poolId,
		latest_base_token_id: pair.tokenAId,
		latest_quote_token_id: pair.tokenBId,
		latest_price_quote: price
	};
}

afterEach(() => vi.restoreAllMocks());

describe('price resolution', () => {
	it('indexes latest swaps and omits a pool without a latest round', () => {
		const latest = latestSwapsByPool(new Map(fixture.aggregates.map((agg) => [agg.pool_id, agg])));
		expect([...latest.keys()]).toEqual([1, 2]);
		expect(latest.get(2)).toEqual({
			pool_id: 2,
			ts: '2026-09-10T00:00:00+00:00',
			base_token_id: 0,
			quote_token_id: 395614,
			price_quote: 5,
			poolbal_a: 7,
			poolbal_b: 35
		});
	});

	it.each([false, true])('prices a direct X/VOI pool, reversed swap = %s', (reversed) => {
		const xVoi = pair(1, 10, 'x', 0, 'VOI');
		const agg = aggregate(xVoi, reversed ? 0.25 : 4);
		if (reversed) {
			agg.latest_base_token_id = 0;
			agg.latest_quote_token_id = 10;
		}
		const usd = resolveSymbolUsd([xVoi], latestSwapsByPool(new Map([[1, agg]])), 0.02);
		expect(usd.get('X')).toBe(4 * 0.02);
	});

	it('uses USDC/VOI then X/USDC for X while the final USDC USD seed stays 1', () => {
		const xUsdc = pair(1, 10, 'X', 20, 'USDC');
		const usdcVoi = pair(2, 20, 'USDC', 0, 'VOI');
		const latest = latestSwapsByPool(
			new Map([
				[1, aggregate(xUsdc, 3)],
				[2, aggregate(usdcVoi, 40)]
			])
		);
		const usd = resolveSymbolUsd([xUsdc, usdcVoi], latest, 0.02);
		// USDC is seeded at $1 only in the final USD map. X uses the USDC/VOI
		// leg's 40 VOI, then the X/USDC leg's 3: (40 * 3) * 0.02 = $2.40.
		expect(usd.get('X')).toBe(40 * 3 * 0.02);
		expect(usd.get('USDC')).toBe(1);
	});

	it('stores zero and warns for an unpriceable symbol', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const usd = resolveSymbolUsd([pair(1, 10, 'X', 0, 'VOI')], new Map(), 0.02);
		expect(usd.get('X')).toBe(0);
		expect(warn).toHaveBeenCalledExactlyOnceWith('No price path found for token: X');
	});

	it('gives WVOI the same USD price as VOI without a pool', () => {
		const usd = resolveSymbolUsd([], new Map(), 0.02);
		expect(usd.get('VOI')).toBe(0.02);
		expect(usd.get('WVOI')).toBe(0.02);
	});

	it.each(['USDC', 'AUSDC', 'USDT', 'AUSDT'])('keeps the %s seed over pool pricing', (symbol) => {
		const stableVoi = pair(1, 20, symbol, 0, 'VOI');
		const latest = latestSwapsByPool(new Map([[1, aggregate(stableVoi, 40)]]));
		expect(resolveSymbolUsd([stableVoi], latest, 0.02).get(symbol)).toBe(1);
	});

	it('terminates an A/B, B/A cycle without a VOI path', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const ab = pair(1, 10, 'A', 20, 'B');
		const ba = pair(2, 20, 'B', 10, 'A');
		const latest = latestSwapsByPool(
			new Map([
				[1, aggregate(ab, 2)],
				[2, aggregate(ba, 0.5)]
			])
		);
		const usd = resolveSymbolUsd([ab, ba], latest, 0.02);
		expect(usd.get('A')).toBe(0);
		expect(usd.get('B')).toBe(0);
		expect(warn.mock.calls).toEqual([
			['No price path found for token: A'],
			['No price path found for token: B']
		]);
	});

	it('ignores swaps whose token ids match neither orientation', () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const xVoi = pair(1, 10, 'X', 0, 'VOI');
		const agg = { ...aggregate(xVoi, 4), latest_base_token_id: 98, latest_quote_token_id: 99 };
		const latest = latestSwapsByPool(new Map([[1, agg]]));
		expect(resolveSymbolUsd([xVoi], latest, 0.02).get('X')).toBe(0);
	});

	it('copies only positive prices for Vestige in insertion order', () => {
		const usd = new Map([
			['X', 0],
			['VOI', 0.02],
			['BAD', -1],
			['USDC', 1]
		]);
		const result = vestigePriceMap(usd);
		expect([...result]).toEqual([
			['VOI', 0.02],
			['USDC', 1]
		]);
		expect(result).not.toBe(usd);
		expect(usd.has('X')).toBe(true);
	});
});
