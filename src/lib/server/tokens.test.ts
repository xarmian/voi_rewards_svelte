import { describe, expect, it } from 'vitest';
import type { PoolCatalog } from '$lib/types/ohlcv.types';
import { uniqueTokens } from './tokens';

function pool(overrides: Partial<PoolCatalog> = {}): PoolCatalog {
	return {
		pool_id: 1,
		token_a_id: 395614,
		token_a_symbol: 'aUSDC',
		token_a_decimals: 6,
		token_a_type: 'ARC200',
		token_b_id: 0,
		token_b_symbol: 'VOI',
		token_b_decimals: 6,
		token_b_type: 'VOI',
		lp_asset_id: 1,
		escrow_hex: '',
		...overrides
	};
}

describe('uniqueTokens', () => {
	it('prefers the ASA aUSDC representative regardless of pool order', () => {
		const arc = pool();
		const asa = pool({ token_a_id: 302190, token_a_type: 'ASA' });
		for (const pools of [
			[arc, asa],
			[asa, arc]
		]) {
			expect(uniqueTokens(pools, 'usdc')).toEqual([
				{
					id: 302190,
					symbol: 'aUSDC',
					decimals: 6,
					type: 'ASA',
					poolCount: 2,
					imageUrl: 'https://asset-verification.nautilus.sh/icons/302190.png'
				}
			]);
		}
	});

	it('prefers ASA even when the other type has a lower id, then the lowest ASA id', () => {
		const pools = [
			pool({ token_a_id: 1 }),
			pool({ token_a_id: 40, token_a_type: 'ASA' }),
			pool({ token_a_id: 30, token_a_type: 'ASA' })
		];
		for (const rows of [pools, [...pools].reverse()]) {
			expect(uniqueTokens(rows, 'usdc')[0]).toMatchObject({ id: 30, type: 'ASA', poolCount: 3 });
		}
	});

	it('chooses the lowest ARC200 id and keeps its metadata', () => {
		const pools = [pool(), pool({ token_a_id: 12, token_a_decimals: 8 })];
		for (const rows of [pools, [...pools].reverse()]) {
			expect(uniqueTokens(rows, 'usdc')[0]).toMatchObject({
				id: 12,
				decimals: 8,
				type: 'ARC200',
				poolCount: 2,
				imageUrl: 'https://asset-verification.nautilus.sh/icons/12.png'
			});
		}
	});

	it('collapses wVOI and VOI with the lowest id, retaining every appearance', () => {
		const pools = [
			pool({ token_a_id: 390001, token_a_symbol: 'wVOI' }),
			pool({ token_b_id: 7, token_b_symbol: 'wVOI', token_b_type: 'ARC200' })
		];
		for (const rows of [pools, [...pools].reverse()]) {
			expect(uniqueTokens(rows, 'voi')).toEqual([
				{
					id: 0,
					symbol: 'VOI',
					decimals: 6,
					type: 'VOI',
					poolCount: 3,
					imageUrl: '/icons/voi-token.png'
				}
			]);
		}
	});

	it('preserves case-insensitive substring filtering, count/symbol sorting and image rules', () => {
		const pools = [
			pool({ token_a_id: 3, token_a_symbol: 'ZED' }),
			pool({ token_a_id: 4, token_a_symbol: 'Alpha' }),
			pool({ token_a_id: 5, token_a_symbol: 'UNIT' })
		];
		expect(uniqueTokens(pools, '').map(({ symbol, poolCount }) => [symbol, poolCount])).toEqual([
			['VOI', 3],
			['Alpha', 1],
			['UNIT', 1],
			['ZED', 1]
		]);
		expect(uniqueTokens(pools, 'nI')).toEqual([
			{
				id: 5,
				symbol: 'UNIT',
				decimals: 6,
				type: 'ARC200',
				poolCount: 1,
				imageUrl: 'https://asset-verification.nautilus.sh/icons/5.png'
			}
		]);
		expect(uniqueTokens(pools, 'missing')).toEqual([]);
		expect(uniqueTokens(pools, '5')).toEqual([]);
		expect(uniqueTokens(pools, ' ')).toEqual([]);
	});
});
