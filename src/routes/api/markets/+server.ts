import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabasePrivateClient } from '$lib/supabase-server';
import { fetchCirculatingSupply } from '$lib/utils/voi';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';
import { fetchVestigeMarketsForAsset } from '$lib/utils/vestige';

// Get all equivalent token IDs for a given token (handles wrapped/native mappings)
async function getTokenEquivalentIds(
	tokenId: number,
	supabaseMimirClient: ReturnType<typeof createClient>
): Promise<number[]> {
	const ids = new Set<number>([tokenId]);

	// Query arc200_contracts for mappings in both directions
	const { data } = await supabaseMimirClient
		.from('arc200_contracts')
		.select('contract_id, token_id')
		.or(`contract_id.eq.${tokenId},token_id.eq.${tokenId}`);

	if (data) {
		for (const row of data) {
			ids.add(row.contract_id);
			// Only add token_id if it's a single number (not a pool's comma-separated pair)
			if (row.token_id && !row.token_id.includes(',')) {
				const parsed = parseInt(row.token_id, 10);
				if (!isNaN(parsed)) ids.add(parsed);
			}
		}
	}

	return Array.from(ids);
}

interface MarketSnapshot {
	price: number;
	volume_24h: number;
	tvl: number | null;
	high_24h: number | null;
	low_24h: number | null;
	price_change_24h: number | null;
	price_change_percentage_24h: number | null;
	timestamp: string;
}

interface Exchange {
	name: string;
	type: string;
	network: string;
}

interface RawTradingPair {
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

export const GET: RequestHandler = async ({ url, fetch }) => {
	try {
		// Get tokenId parameter from URL (numeric token ID)
		const tokenIdParam = url.searchParams.get('tokenId');

		// Validate tokenId if provided
		let tokenId: number | null = null;
		if (tokenIdParam !== null) {
			tokenId = parseInt(tokenIdParam, 10);
			if (isNaN(tokenId)) {
				return json({ error: 'tokenId must be a valid number' }, { status: 400 });
			}
		}

		// Fetch the circulating supply data with error handling
		let circulatingSupply = '0';
		let percentDistributed = '0';

		try {
			const supplyData = await fetchCirculatingSupply();
			circulatingSupply = supplyData.circulatingSupply;
			percentDistributed = supplyData.percentDistributed;
		} catch (error) {
			console.error('Failed to fetch circulating supply:', error);
		}

		// If a tokenId is provided, build markets using both MIMIR data and cross-chain snapshots
		let marketData: any[] = [];
		if (tokenId !== null) {
			const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

			// Get all equivalent token IDs (handles wrapped/native mappings)
			const equivalentIds = await getTokenEquivalentIds(tokenId, supabaseMimirClient);

			// 1) Find pools containing any of the equivalent token IDs
			const orConditions = equivalentIds
				.flatMap((id) => [`token_a_id.eq.${id}`, `token_b_id.eq.${id}`])
				.join(',');
			const poolsRes = await supabaseMimirClient
				.from('pool_catalog')
				.select('*')
				.or(orConditions);
			if (poolsRes.error) throw poolsRes.error;

			// Deduplicate pools by pool_id (same pool might match multiple equivalent token IDs)
			const seenPoolIds = new Set<number>();
			const pools = (poolsRes.data || []).filter((pool: any) => {
				if (seenPoolIds.has(pool.pool_id)) return false;
				seenPoolIds.add(pool.pool_id);
				return true;
			});

			// Normalize pairs with selected token as base
			const pairs = pools.map((pool: any) => {
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

            if (pairs.length === 0) {
                return json({
                    marketData: [],
                    aggregates: { totalVolume: 0, totalTvl: 0, weightedAveragePrice: 0 },
                    circulatingSupply: {
                        circulatingSupply: parseFloat(circulatingSupply),
                        percentDistributed: parseFloat(percentDistributed)
                    }
                });
            }

            // USD helpers
            // VOI USD reference - get from price history which uses proper sources
            let voiUsd = 0;
            try {
                const refRes = await fetch(`${url.origin}/api/price-history?period=24h&token=VOI`);
                const refJson = await refRes.json();
                if (Array.isArray(refJson) && refJson.length) {
                    const rawVoiUsd = Number(refJson[refJson.length - 1]?.value || 0);
                    // Filter out obviously wrong VOI prices (should be around $0.0007, not $0.01+)
                    voiUsd = rawVoiUsd > 0.005 ? 0 : rawVoiUsd;
                    if (rawVoiUsd !== voiUsd) {
                        console.warn('Filtered out inflated VOI price:', rawVoiUsd, 'using 0 instead');
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch VOI price from price-history API:', e);
            }
            
            // console.log('VOI USD price for conversion:', voiUsd);
            const poolIds = pairs.map((p) => p.poolId);

            // 2) Latest swap for price + reserves
            const latestRes = await supabaseMimirClient
                .from('dex_swaps_materialized')
                .select('pool_id, ts, base_token_id, quote_token_id, price_quote, poolbal_a, poolbal_b')
                .in('pool_id', poolIds)
                .order('ts', { ascending: false });
            if (latestRes.error) throw latestRes.error;
            const latestByPool = new Map<number, any>();
            for (const row of latestRes.data || []) {
                if (!latestByPool.has(row.pool_id)) latestByPool.set(row.pool_id, row);
            }

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

            // Helper to normalize symbols for consistent map lookups
            const norm = (s: string) => (s || '').toUpperCase();

            // Step 2: Get all pool prices for path finding
            const poolPrices = new Map<string, { price: number, tokenA: string, tokenB: string }>();

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
                            poolPrices.set(keyBA, { price: 1/p, tokenA: symB, tokenB: symA });
                        } else if (latest.base_token_id === pair.tokenBId && latest.quote_token_id === pair.tokenAId) {
                            poolPrices.set(keyBA, { price: p, tokenA: symB, tokenB: symA });
                            poolPrices.set(keyAB, { price: 1/p, tokenA: symA, tokenB: symB });
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
            symbolUsd.set('VOI', voiUsd);
            symbolUsd.set('USDC', 1);
            symbolUsd.set('AUSDC', 1);
            symbolUsd.set('USDT', 1);
            symbolUsd.set('AUSDT', 1);

            // Convert VOI prices to USD prices
            for (const [symbol, voiPrice] of priceInVoi) {
                if (!symbolUsd.has(symbol)) {
                    const usdPrice = voiPrice * voiUsd;
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

            // 3) 24h window for volume & change
            const startISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const windowRes = await supabaseMimirClient
                .from('dex_swaps_materialized')
                .select('pool_id, ts, base_token_id, quote_token_id, price_quote, volume_base, volume_quote')
                .in('pool_id', poolIds)
                .gte('ts', startISO)
                .order('ts', { ascending: true });
            if (windowRes.error) throw windowRes.error;
            const windowByPool = new Map<number, any[]>();
            for (const row of windowRes.data || []) {
                const arr = windowByPool.get(row.pool_id) || [];
                arr.push(row);
                windowByPool.set(row.pool_id, arr);
            }

			// 4) Get cross-chain market snapshots ONLY for VOI
			let crossChainSnapshots: any[] = [];
			// Check if any equivalent is VOI (0) or wVOI (390001)
			const voiIds = [0, 390001];
			if (equivalentIds.some((id) => voiIds.includes(id))) {
                try {
                    // Get latest snapshots from cross-chain exchanges (Tinyman, PactFi, Uniswap, etc.)
                    const { data: snapshots, error: snapshotsError } = await supabasePrivateClient
                        .from('market_snapshots')
                        .select(`
                            trading_pair_id,
                            price,
                            volume_24h,
                            tvl,
                            high_24h,
                            low_24h,
                            price_change_24h,
                            price_change_percentage_24h,
                            timestamp,
                            trading_pairs!inner(
                                id,
                                base_token,
                                quote_token,
                                exchange:exchanges!inner(name, type, network)
                            )
                        `)
                        .order('timestamp', { ascending: false })
                        .limit(50); // Get recent snapshots
                    
                    if (!snapshotsError && snapshots) {
                        // Group by trading_pair_id and get the latest for each
                        const latestSnapshots = new Map();
                        snapshots.forEach(snapshot => {
                            const pairId = snapshot.trading_pair_id;
                            if (!latestSnapshots.has(pairId) || 
                                new Date(snapshot.timestamp) > new Date(latestSnapshots.get(pairId).timestamp)) {
                                latestSnapshots.set(pairId, snapshot);
                            }
                        });
                        
                        // Filter out Voi network exchanges (Humble, Nomadex) since we get those from MIMIR
                        crossChainSnapshots = Array.from(latestSnapshots.values())
                            .filter(snapshot => snapshot.trading_pairs.exchange.network !== 'Voi')
                            .map(snapshot => ({
                                trading_pair_id: snapshot.trading_pair_id,
                                exchange: snapshot.trading_pairs.exchange.name,
                                pair: `${snapshot.trading_pairs.quote_token}/${snapshot.trading_pairs.base_token}`,
                                type: snapshot.trading_pairs.exchange.type,
                                network: snapshot.trading_pairs.exchange.network,
                                url: null,
                                pool_url: null,
                                base_token_id: 0, // VOI
                                quote_token_id: null,
                                price: snapshot.price,
                                volume_24h: snapshot.volume_24h,
                                tvl: snapshot.tvl,
                                high_24h: snapshot.high_24h,
                                low_24h: snapshot.low_24h,
                                price_change_24h: snapshot.price_change_24h,
                                price_change_percentage_24h: snapshot.price_change_percentage_24h,
                                lastUpdated: snapshot.timestamp
                            }));
                    }
                } catch (e) {
                    console.warn('Failed to fetch cross-chain snapshots:', e);
                }
            }

            // Helper function to generate pool URLs based on exchange
            function getPoolUrl(exchange: string, poolId: number, tokenAId: number, tokenAType: string, tokenBId: number, tokenBType: string): string | null {
                if (exchange === 'humble') {
                    return `https://voi.humble.sh/#/swap?poolId=${poolId}`;
                } else if (exchange === 'nomadex') {
                    // Map token types to Nomadex URL format
                    const getTokenTypeCode = (type: string) => {
                        switch(type?.toUpperCase()) {
                            case 'VOI': return 0;
                            case 'ASA': return 1;
                            case 'ARC200': return 2;
                            default: return 2; // Default to ARC200 if unknown
                        }
                    };
                    
                    const typeA = getTokenTypeCode(tokenAType);
                    const typeB = getTokenTypeCode(tokenBType);
                    
                    // Use actual token IDs as-is
                    return `https://voi.nomadex.app/${typeA}/${tokenAId}/${typeB}/${tokenBId}`;
                }
                return null;
            }

            // 5) Compose market rows from MIMIR DEX data
            const voiDexMarkets = pairs.map((pair) => {
                const latest = latestByPool.get(pair.poolId);
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

                const rows = windowByPool.get(pair.poolId) || [];
                let volQuoteSum = 0;
                let firstPrice: number | null = null;
                let lastPrice: number | null = null;
                for (const r of rows) {
                    const pq = Number(r.price_quote || 0);
                    let orientedPrice = 0; // pair base in pair quote units
                    if (r.base_token_id === pair.baseTokenId && r.quote_token_id === pair.quoteTokenId) {
                        orientedPrice = pq;
                        // quote volume already in pair.quote units
                        volQuoteSum += Number(r.volume_quote || 0);
                    } else if (
                        r.base_token_id === pair.quoteTokenId &&
                        r.quote_token_id === pair.baseTokenId &&
                        pq > 0
                    ) {
                        orientedPrice = 1 / pq;
                        // In this orientation, "quote" is the pair base. Use volume_base which is pair.quote units
                        volQuoteSum += Number(r.volume_base || 0);
                    }
                    if (!firstPrice && orientedPrice > 0) firstPrice = orientedPrice;
                    if (orientedPrice > 0) lastPrice = orientedPrice;
                }

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
                    firstPrice && lastPrice && firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : null;

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
            });
            
			// 6) Fetch Vestige (Algorand) markets if token has algo_asset_id
			let vestigeMarkets: any[] = [];
			try {
				// Check if the selected token has an algo_asset_id
				const { data: tokenData, error: tokenError } = await supabaseMimirClient
					.from('arc200_contracts')
					.select('algo_asset_id')
					.eq('contract_id', tokenId)
					.single();

				if (!tokenError && tokenData && tokenData.algo_asset_id) {
					// Create a price map from our symbol USD prices for TVL calculation
					const priceMapForVestige = new Map<string, number>();
					for (const [symbol, usdPrice] of symbolUsd) {
						if (usdPrice > 0) {
							priceMapForVestige.set(symbol, usdPrice);
						}
					}
					vestigeMarkets = await fetchVestigeMarketsForAsset(
						tokenData.algo_asset_id,
						priceMapForVestige
					);
				} else {
					console.log(`Token ${tokenId} has no algo_asset_id, skipping Vestige markets`);
				}
			} catch (error) {
				console.error('Error fetching Vestige markets:', error);
				// Continue without Vestige data
			}

            // 7) Combine VOI DEX markets with cross-chain snapshots and Vestige markets
            marketData = [...voiDexMarkets, ...crossChainSnapshots, ...vestigeMarkets];
        } else {
            // Legacy: general list using platform snapshots
            const query = supabasePrivateClient
                .from('trading_pairs')
                .select(
                    `
                id,
                exchange_id,
                exchange:exchanges!inner (
                    name,
                    type,
                    network
                ),
                base_token,
                quote_token,
                contract_address,
                pool_url,
                created_at,
                updated_at,
                market_snapshots!inner (
                    price,
                    volume_24h,
                    tvl,
                    high_24h,
                    low_24h,
                    price_change_24h,
                    price_change_percentage_24h,
                    timestamp
                )
            `
                )
                .order('timestamp', { foreignTable: 'market_snapshots', ascending: false })
                .limit(1, { foreignTable: 'market_snapshots' });

            const { data, error } = await query;
            if (error) throw error;
            marketData = data as any[];
        }

		// Process market data and sort by volume
		let processedMarketData: any[] = [];
		if (tokenId !== null) {
			processedMarketData = (marketData || [])
				.map((m: any) => m)
				.sort((a: any, b: any) => (b.volume_24h || 0) - (a.volume_24h || 0));
		} else {
			processedMarketData = ((marketData || []) as unknown as RawTradingPair[])
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

		// Calculate aggregates - avoid double counting by tracking unique pools
		const uniquePools = new Set<number>();
		const aggregates = processedMarketData.reduce(
			(acc, market) => {
				// Only count each pool once (by trading_pair_id/poolId)
				const poolId = market.trading_pair_id;
				if (!uniquePools.has(poolId)) {
					uniquePools.add(poolId);
					acc.totalVolume = (acc.totalVolume || 0) + (market.volume_24h || 0);
					acc.totalTvl = (acc.totalTvl || 0) + (market.tvl || 0);
				}
				return acc;
			},
			{ totalVolume: 0, totalTvl: 0 }
		);

		// Calculate volume-weighted average price
		const weightedAveragePrice = processedMarketData.reduce((acc, market) => {
			const volume = market.volume_24h || 0;
			const totalVolume = aggregates.totalVolume;
			if (totalVolume === 0) return acc;
			return acc + (market.price || 0) * (volume / totalVolume);
		}, 0);

		return json({
			marketData: processedMarketData,
			aggregates: {
				...aggregates,
				weightedAveragePrice
			},
			circulatingSupply: {
				circulatingSupply: parseFloat(circulatingSupply),
				percentDistributed: parseFloat(percentDistributed)
			}
		});
	} catch (error) {
		console.error('Error fetching market data:', error);
		return json({ error: 'Failed to fetch market data' }, { status: 500 });
	}
};
