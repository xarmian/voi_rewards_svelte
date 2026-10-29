import { pairWindow, type PoolAggregate, type latestSwapRow } from '$lib/server/poolAggregates';
import type { MarketPair } from './pairs';
import { norm } from './priceMap';
import { getPoolUrl } from './poolUrls';

export interface MarketSnapshot {
	price: number;
	volume_24h: number;
	tvl: number | null;
	high_24h: number | null;
	low_24h: number | null;
	price_change_24h: number | null;
	price_change_percentage_24h: number | null;
	timestamp: string;
}

export interface Exchange {
	name: string;
	type: string;
	network: string;
}

export interface RawTradingPair {
	id: number;
	exchange_id: number;
	base_token: string;
	quote_token: string;
	contract_address: string | null;
	pool_url: string | null;
	created_at: string;
	updated_at: string;
	market_snapshots: MarketSnapshot[];
	exchange: Exchange;
}

export function composeDexMarketRow(
	pair: MarketPair,
	latest: ReturnType<typeof latestSwapRow>,
	poolAggregate: PoolAggregate | undefined,
	symbolUsd: Map<string, number>
) {
	let price = 0;
	// Reserves come from pool token_a/token_b balances; do not orient by base/quote
	// Use original pool token metadata to decode units correctly
	let reserveTokenA = 0;
	let reserveTokenB = 0;
	if (latest) {
		const p = Number(latest.price_quote || 0);
		if (latest.base_token_id === pair.baseTokenId && latest.quote_token_id === pair.quoteTokenId) {
			price = p;
		} else if (
			latest.base_token_id === pair.quoteTokenId &&
			latest.quote_token_id === pair.baseTokenId &&
			p > 0
		) {
			price = 1 / p;
		}
		// Reserves are already in correct decimal format - no conversion needed
		reserveTokenA = Number(latest.poolbal_a || 0);
		reserveTokenB = Number(latest.poolbal_b || 0);
	}

	const { volQuoteSum, firstPrice, lastPrice } = pairWindow(
		poolAggregate,
		pair.baseTokenId,
		pair.quoteTokenId
	);

	// USD conversion using comprehensive price resolution (normalize symbols for lookup)
	const qUsd = symbolUsd.get(norm(pair.quoteSymbol)) || 0;
	const baseUsd = symbolUsd.get(norm(pair.baseSymbol)) || 0;

	// Calculate USD price: price (quote per base) * quote USD price
	// This gives us the USD value of 1 base token according to this pool
	// Falls back to base USD price if quote price is unavailable
	const priceUsd = qUsd > 0 && price > 0 ? price * qUsd : baseUsd;

	// Volume calculation using quote token USD value
	const volume24h = qUsd > 0 && volQuoteSum > 0 ? volQuoteSum * qUsd : 0;

	// TVL calculation using comprehensive price resolution (normalize symbols for lookup)
	let tvl = 0;
	let tokenAUsd = symbolUsd.get(norm(pair.tokenASymbol)) || 0;
	let tokenBUsd = symbolUsd.get(norm(pair.tokenBSymbol)) || 0;

	// If we only have one token's price, derive the other from the pool's reserves
	// In a balanced AMM pool, value of tokenA side ≈ value of tokenB side
	// So: reserveA * priceA ≈ reserveB * priceB
	// Therefore: priceB = (reserveA * priceA) / reserveB
	if (tokenAUsd > 0 && tokenBUsd === 0 && reserveTokenA > 0 && reserveTokenB > 0) {
		tokenBUsd = (reserveTokenA * tokenAUsd) / reserveTokenB;
	} else if (tokenBUsd > 0 && tokenAUsd === 0 && reserveTokenA > 0 && reserveTokenB > 0) {
		tokenAUsd = (reserveTokenB * tokenBUsd) / reserveTokenA;
	}

	if (tokenAUsd > 0 && tokenBUsd > 0) {
		// Both tokens have USD prices - use actual values
		tvl = reserveTokenA * tokenAUsd + reserveTokenB * tokenBUsd;
	} else if (tokenAUsd > 0) {
		// Only tokenA has price - assume balanced pool and double
		tvl = reserveTokenA * tokenAUsd * 2;
	} else if (tokenBUsd > 0) {
		// Only tokenB has price - assume balanced pool and double
		tvl = reserveTokenB * tokenBUsd * 2;
	} else {
		// No price information available
		tvl = 0;
	}

	const priceChangePct =
		firstPrice && lastPrice && firstPrice > 0
			? ((lastPrice - firstPrice) / firstPrice) * 100
			: null;

	const result = {
		trading_pair_id: pair.poolId,
		exchange: pair.exchange || 'DEX',
		pair: `${pair.baseSymbol}/${pair.quoteSymbol}`,
		type: 'DEX',
		network: 'Voi',
		url: null,
		pool_url: getPoolUrl(
			pair.exchange,
			pair.poolId,
			pair.tokenAId,
			pair.tokenAType,
			pair.tokenBId,
			pair.tokenBType
		),
		base_token_id: pair.baseTokenId,
		quote_token_id: pair.quoteTokenId,
		base_decimals: pair.baseDecimals,
		quote_decimals: pair.quoteDecimals,
		// Carry original pool token metadata to client for potential debugging/use
		token_a_symbol: pair.tokenASymbol,
		token_b_symbol: pair.tokenBSymbol,
		token_a_decimals: pair.tokenADecimals,
		token_b_decimals: pair.tokenBDecimals,
		price: priceUsd,
		volume_24h: volume24h,
		tvl: tvl,
		high_24h: null,
		low_24h: null,
		price_change_24h: null,
		price_change_percentage_24h: priceChangePct,
		lastUpdated: new Date().toISOString()
	} as any;

	return result;
}

export function sortByVolume(marketData: unknown[] | null) {
	return (marketData || [])
		.map((m: any) => m)
		.sort((a: any, b: any) => (b.volume_24h || 0) - (a.volume_24h || 0));
}

export function legacyMarketRows(marketData: unknown[] | null) {
	return ((marketData || []) as unknown as RawTradingPair[])
		.map((market) => {
			const latestSnapshot = (market as any).market_snapshots?.[0] || {};
			return {
				trading_pair_id: (market as any).id,
				exchange: (market as any).exchange.name,
				pair: `${(market as any).quote_token}/${(market as any).base_token}`,
				type: (market as any).exchange.type,
				network: (market as any).exchange.network,
				url: null,
				pool_url: (market as any).pool_url,
				price: latestSnapshot.price,
				volume_24h: latestSnapshot.volume_24h,
				tvl: latestSnapshot.tvl,
				high_24h: latestSnapshot.high_24h,
				low_24h: latestSnapshot.low_24h,
				price_change_24h: latestSnapshot.price_change_24h,
				price_change_percentage_24h: latestSnapshot.price_change_percentage_24h,
				lastUpdated: new Date(latestSnapshot.timestamp).toLocaleString()
			};
		})
		.sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0));
}

export function marketAggregates(
	processedMarketData: {
		network: string;
		exchange: string;
		trading_pair_id: number;
		volume_24h?: number | null;
		tvl?: number | null;
		price?: number | null;
	}[]
) {
	// Pool IDs belong to a network and exchange; keep the first row for each source-qualified pool.
	const uniquePools = new Set<string>();
	const uniqueMarkets = processedMarketData.filter((market) => {
		const poolKey = JSON.stringify([market.network, market.exchange, market.trading_pair_id]);
		if (uniquePools.has(poolKey)) return false;
		uniquePools.add(poolKey);
		return true;
	});
	const aggregates = uniqueMarkets.reduce(
		(acc, market) => {
			acc.totalVolume = (acc.totalVolume || 0) + (market.volume_24h || 0);
			acc.totalTvl = (acc.totalTvl || 0) + (market.tvl || 0);
			return acc;
		},
		{ totalVolume: 0, totalTvl: 0 }
	);

	// Calculate volume-weighted average price
	const weightedAveragePrice = uniqueMarkets.reduce((acc, market) => {
		const volume = market.volume_24h || 0;
		const totalVolume = aggregates.totalVolume;
		if (totalVolume === 0) return acc;
		return acc + (market.price || 0) * (volume / totalVolume);
	}, 0);
	return { ...aggregates, weightedAveragePrice };
}
