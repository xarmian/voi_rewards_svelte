import { latestSwapRow, type PoolAggregate } from '$lib/server/poolAggregates';
import type { MarketPair } from './pairs';

export function latestSwapsByPool(poolAggregates: Map<number, PoolAggregate>) {
	const latestByPool = new Map<number, ReturnType<typeof latestSwapRow>>();
	for (const agg of poolAggregates.values()) {
		const row = latestSwapRow(agg);
		if (row) latestByPool.set(row.pool_id, row);
	}
	return latestByPool;
}

// Helper to normalize symbols for consistent map lookups
export const norm = (s: string) => (s || '').toUpperCase();

export function resolveSymbolUsd(
	pairs: MarketPair[],
	latestByPool: Map<number, ReturnType<typeof latestSwapRow>>,
	voiUsdForMath: number
): Map<string, number> {
	// Build comprehensive price map using multi-hop resolution through VOI
	const symbols = new Set<string>();
	pairs.forEach((p) => {
		symbols.add((p.baseSymbol || '').toUpperCase());
		symbols.add((p.quoteSymbol || '').toUpperCase());
	});

	// Step 1: Build price-in-VOI map starting with known values
	const priceInVoi = new Map<string, number>();
	priceInVoi.set('VOI', 1);
	priceInVoi.set('WVOI', 1);

	// Step 2: Get all pool prices for path finding
	const poolPrices = new Map<string, { price: number; tokenA: string; tokenB: string }>();

	// Fetch latest prices for all pools we're interested in
	for (const pair of pairs) {
		const latest = latestByPool.get(pair.poolId);
		if (latest) {
			const p = Number(latest.price_quote || 0);
			if (p > 0) {
				// Store price as tokenA per tokenB (based on what's in the swap data)
				const symA = norm(pair.tokenASymbol);
				const symB = norm(pair.tokenBSymbol);
				const keyAB = `${symA}_${symB}`;
				const keyBA = `${symB}_${symA}`;

				// Price_quote represents base_token per quote_token
				if (latest.base_token_id === pair.tokenAId && latest.quote_token_id === pair.tokenBId) {
					poolPrices.set(keyAB, { price: p, tokenA: symA, tokenB: symB });
					poolPrices.set(keyBA, { price: 1 / p, tokenA: symB, tokenB: symA });
				} else if (
					latest.base_token_id === pair.tokenBId &&
					latest.quote_token_id === pair.tokenAId
				) {
					poolPrices.set(keyBA, { price: p, tokenA: symB, tokenB: symA });
					poolPrices.set(keyAB, { price: 1 / p, tokenA: symA, tokenB: symB });
				}
			}
		}
	}

	// Step 3: First pass - direct VOI pairs
	for (const [key, priceInfo] of poolPrices) {
		if (priceInfo.tokenB === 'VOI' && !priceInVoi.has(priceInfo.tokenA)) {
			priceInVoi.set(priceInfo.tokenA, priceInfo.price);
		}
	}

	// Step 4: Multi-hop resolution - keep iterating until no new prices found
	let foundNew = true;
	let iterations = 0;
	const maxIterations = 10; // Prevent infinite loops

	while (foundNew && iterations < maxIterations) {
		foundNew = false;
		iterations++;

		for (const [key, priceInfo] of poolPrices) {
			const { tokenA, tokenB, price } = priceInfo;

			// If we know tokenB price but not tokenA, calculate tokenA price
			if (priceInVoi.has(tokenB) && !priceInVoi.has(tokenA)) {
				const tokenBVoiPrice = priceInVoi.get(tokenB)!;
				// IMPORTANT: price represents "tokenA per tokenB"
				// If we know tokenB price in VOI, then tokenA price = tokenB price * (tokenA per tokenB)
				const newPrice = tokenBVoiPrice * price; // tokenA per VOI = (tokenB per VOI) * (tokenA per tokenB)
				priceInVoi.set(tokenA, newPrice);

				// Special debug for UNIT/SHELLY
				foundNew = true;
			}
		}
	}

	// Step 5: Build final USD price map
	const symbolUsd = new Map<string, number>();
	symbolUsd.set('VOI', voiUsdForMath);
	symbolUsd.set('USDC', 1);
	symbolUsd.set('AUSDC', 1);
	symbolUsd.set('USDT', 1);
	symbolUsd.set('AUSDT', 1);

	// Convert VOI prices to USD prices
	for (const [symbol, voiPrice] of priceInVoi) {
		if (!symbolUsd.has(symbol)) {
			const usdPrice = voiPrice * voiUsdForMath;
			symbolUsd.set(symbol, usdPrice);
		}
	}

	// Add zeros for symbols we couldn't price
	for (const s of symbols) {
		if (!symbolUsd.has(s)) {
			symbolUsd.set(s, 0);
			console.warn(`No price path found for token: ${s}`);
		}
	}
	return symbolUsd;
}

export function vestigePriceMap(symbolUsd: Map<string, number>) {
	// Create a price map from our symbol USD prices for TVL calculation
	const priceMapForVestige = new Map<string, number>();
	for (const [symbol, usdPrice] of symbolUsd) {
		if (usdPrice > 0) {
			priceMapForVestige.set(symbol, usdPrice);
		}
	}
	return priceMapForVestige;
}
