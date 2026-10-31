import { describe, expect, it } from 'vitest';
import {
	weightedAveragePrice,
	displayPrice,
	circulatingMarketCap,
	tokenTotalSupplyAdjusted,
	fullyDilutedMarketCap,
	sortMarkets,
	filterMarkets
} from './derive';

const token = { symbol: 'UNIT' };
const voi = { symbol: 'VOI' };

describe('market prices and supply', () => {
	it('excludes null/nonpositive prices and zero/null volumes from weighted averages', () => {
		expect(
			weightedAveragePrice(
				[
					{ price: null, volume_24h: 1000 },
					{ price: 0, volume_24h: 1000 },
					{ price: -1, volume_24h: 1000 },
					{ price: 50, volume_24h: 0 },
					{ price: 60, volume_24h: null },
					{ price: 2, volume_24h: 10 },
					{ price: 4, volume_24h: 30 }
				],
				token
			)
		).toBe(3.5);
	});

	it('uses the upper median when all valid prices lack positive volume', () => {
		expect(
			weightedAveragePrice(
				[
					{ price: null, volume_24h: 100 },
					{ price: 8, volume_24h: 0 },
					{ price: 2, volume_24h: null }
				],
				token
			)
		).toBe(8);
		expect(weightedAveragePrice([], token)).toBe(0);
		expect(weightedAveragePrice([{ price: null, volume_24h: 100 }], token)).toBe(0);
	});

	it('filters prices at or above one cent only for exact VOI or a missing token', () => {
		const rows = [
			{ price: 0.002, volume_24h: 10 },
			{ price: 0.01, volume_24h: 10 }
		];
		expect(weightedAveragePrice(rows, voi)).toBe(0.002);
		expect(weightedAveragePrice(rows, null)).toBe(0.002);
		expect(weightedAveragePrice(rows, { symbol: 'voi' })).toBeCloseTo(0.006);
	});

	it('uses market price, then server aggregate, then the last history value', () => {
		const history = [{ value: 8 }, { value: 3 }];
		expect(displayPrice(2, { weightedAveragePrice: 4 }, history)).toBe(2);
		expect(displayPrice(0, { weightedAveragePrice: 4 }, history)).toBe(4);
		expect(displayPrice(0, null, history)).toBe(3);
		expect(displayPrice(0, null, [{ value: 8 }, { value: 0 }])).toBe(0);
		expect(displayPrice(0, null, [])).toBe(0);
	});

	it('uses the passed server circulating supply for VOI and zero for other tokens', () => {
		expect(circulatingMarketCap(voi, 2, { circulatingSupply: 123 })).toBe(246);
		expect(circulatingMarketCap(null, 2, { circulatingSupply: 123 })).toBe(246);
		expect(circulatingMarketCap(token, 2, { circulatingSupply: 123 })).toBe(0);
	});

	it('returns null for VOI when the circulating supply is unknown (TASK-107)', () => {
		expect(circulatingMarketCap(voi, 2, null)).toBeNull();
		expect(circulatingMarketCap(null, 2, undefined)).toBeNull();
		expect(circulatingMarketCap(token, 2, null)).toBe(0);
	});

	it('adjusts token total supply by decimals and uses weighted price for FDV', () => {
		const supply = tokenTotalSupplyAdjusted({ totalSupply: 12300, decimals: 2 });
		expect(supply).toBe(123);
		expect(fullyDilutedMarketCap(supply, 2, token)).toBe(246);
		expect(fullyDilutedMarketCap(supply, 2, voi)).toBe(246);
		expect(tokenTotalSupplyAdjusted({ totalSupply: 12, decimals: 0 })).toBe(12);
		expect(tokenTotalSupplyAdjusted({ totalSupply: 0, decimals: 2 })).toBe(0);
		expect(tokenTotalSupplyAdjusted(null)).toBeNull();
		expect(tokenTotalSupplyAdjusted({ totalSupply: 10 })).toBeNull();
		expect(fullyDilutedMarketCap(null, 2, voi)).toBe(20_000_000_000);
		expect(fullyDilutedMarketCap(0, 2, voi)).toBe(20_000_000_000);
		expect(fullyDilutedMarketCap(null, 2, token)).toBe(0);
	});
});

describe('market sorting', () => {
	it.each(['price', 'tvl', 'volume_24h'])(
		'sorts %s in both directions with stable ties and nulls last',
		(column) => {
			const rows = [
				{ id: 'high', [column]: 5 },
				{ id: 'null1', [column]: null },
				{ id: 'tie1', [column]: 2 },
				{ id: 'undefined' },
				{ id: 'tie2', [column]: 2 },
				{ id: 'low', [column]: 0 },
				{ id: 'null2', [column]: null }
			];
			expect(sortMarkets(rows, column, 'asc').map((row) => row.id)).toEqual([
				'low',
				'tie1',
				'tie2',
				'high',
				'null1',
				'undefined',
				'null2'
			]);
			expect(sortMarkets(rows, column, 'desc').map((row) => row.id)).toEqual([
				'high',
				'tie1',
				'tie2',
				'low',
				'null1',
				'undefined',
				'null2'
			]);
			expect(rows.map((row) => row.id)).toEqual([
				'high',
				'null1',
				'tie1',
				'undefined',
				'tie2',
				'low',
				'null2'
			]);
		}
	);
});

describe('market filtering', () => {
	const rows = [
		{ pair: 'UNIT/VOI', exchange: 'Humble', network: 'Voi' },
		{ pair: 'OTHER/USDC', exchange: 'Pact', network: 'Algorand' }
	];
	it.each(['unit', 'HUMBLE', 'vOi'])(
		'matches pair, exchange or network without case sensitivity (%s)',
		(query) => {
			expect(filterMarkets(rows, query)).toEqual([rows[0]]);
		}
	);
	it('returns the original rows for empty or whitespace queries and retains spaces otherwise', () => {
		expect(filterMarkets(rows, '')).toBe(rows);
		expect(filterMarkets(rows, ' \t ')).toBe(rows);
		expect(filterMarkets(rows, ' unit ')).toEqual([]);
		expect(filterMarkets(rows, 'missing')).toEqual([]);
	});
});
