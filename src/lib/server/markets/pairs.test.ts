import { describe, expect, it } from 'vitest';
import { normalizePairs } from './pairs';

const pool = {
	pool_id: 7,
	exchange: 'humble',
	token_a_id: 10,
	token_a_symbol: 'A',
	token_a_decimals: 6,
	token_a_type: 'ASA',
	token_b_id: 20,
	token_b_symbol: 'B',
	token_b_decimals: 8,
	token_b_type: 'ARC200'
};

describe('normalizePairs', () => {
	it('makes the selected token on side B the base and keeps original pool metadata and key order', () => {
		const [pair] = normalizePairs([pool], [20]);
		expect(JSON.stringify(pair)).toBe(
			JSON.stringify({
				baseTokenId: 20,
				baseSymbol: 'B',
				baseDecimals: 8,
				quoteTokenId: 10,
				quoteSymbol: 'A',
				quoteDecimals: 6,
				poolId: 7,
				exchange: 'humble',
				tokenAId: 10,
				tokenASymbol: 'A',
				tokenADecimals: 6,
				tokenAType: 'ASA',
				tokenBId: 20,
				tokenBSymbol: 'B',
				tokenBDecimals: 8,
				tokenBType: 'ARC200'
			})
		);
	});

	it('keeps side A as base when it is selected', () => {
		expect(normalizePairs([pool], [10])[0]).toMatchObject({
			baseTokenId: 10,
			baseSymbol: 'A',
			baseDecimals: 6,
			quoteTokenId: 20,
			quoteSymbol: 'B',
			quoteDecimals: 8
		});
	});

	it('drops duplicate pool ids with the first row winning', () => {
		const pairs = normalizePairs([pool, { ...pool, exchange: 'other' }], [10]);
		expect(pairs).toHaveLength(1);
		expect(pairs[0].exchange).toBe('humble');
	});

	it.each(['nomadex', 'Nomadex'])(
		'drops pools of the retired exchange %s (TASK-88)',
		(exchange) => {
			const pairs = normalizePairs(
				[
					{ ...pool, exchange },
					{ ...pool, pool_id: 99 }
				],
				[10]
			);
			expect(pairs.map((pair) => pair.exchange)).toEqual(['humble']);
		}
	);

	it('defaults the exchange to DEX', () => {
		expect(normalizePairs([{ ...pool, exchange: '' }], [10])[0].exchange).toBe('DEX');
	});
});
