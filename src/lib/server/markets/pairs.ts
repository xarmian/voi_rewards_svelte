import { isRetiredExchange } from '$lib/markets/retired';

export type MarketPair = ReturnType<typeof normalizePairs>[number];

export function normalizePairs(poolRows: unknown[] | null, equivalentIds: number[]) {
	// Deduplicate pools by pool_id (same pool might match multiple equivalent token IDs)
	const seenPoolIds = new Set<number>();
	const pools = (poolRows || []).filter((pool: any) => {
		if (isRetiredExchange(pool.exchange)) return false;
		if (seenPoolIds.has(pool.pool_id)) return false;
		seenPoolIds.add(pool.pool_id);
		return true;
	});

	// Normalize pairs with selected token as base
	return pools.map((pool: any) => {
		// Check if token_b is one of our equivalent IDs (meaning it should be the base)
		const isTokenBBase = equivalentIds.includes(pool.token_b_id);
		const baseSide = isTokenBBase
			? {
					baseTokenId: pool.token_b_id,
					baseSymbol: pool.token_b_symbol,
					baseDecimals: pool.token_b_decimals
				}
			: {
					baseTokenId: pool.token_a_id,
					baseSymbol: pool.token_a_symbol,
					baseDecimals: pool.token_a_decimals
				};
		const quoteSide = isTokenBBase
			? {
					quoteTokenId: pool.token_a_id,
					quoteSymbol: pool.token_a_symbol,
					quoteDecimals: pool.token_a_decimals
				}
			: {
					quoteTokenId: pool.token_b_id,
					quoteSymbol: pool.token_b_symbol,
					quoteDecimals: pool.token_b_decimals
				};

		// Always carry original pool token_a/token_b metadata for accurate TVL math
		return {
			...baseSide,
			...quoteSide,
			poolId: pool.pool_id,
			exchange: pool.exchange || 'DEX',
			tokenAId: pool.token_a_id,
			tokenASymbol: pool.token_a_symbol,
			tokenADecimals: pool.token_a_decimals,
			tokenAType: pool.token_a_type,
			tokenBId: pool.token_b_id,
			tokenBSymbol: pool.token_b_symbol,
			tokenBDecimals: pool.token_b_decimals,
			tokenBType: pool.token_b_type
		};
	});
}
