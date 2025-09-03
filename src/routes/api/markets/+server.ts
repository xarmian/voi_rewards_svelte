import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabasePrivateClient } from '$lib/supabase-server';
import { fetchCirculatingSupply } from '$lib/utils/voi';
import { TOKENS } from '$lib/utils/tokens';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';

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
		// Get token parameter from URL
		const token = url.searchParams.get('token');

		// Get token variants if a token is specified
		let tokenVariants: string[] | null = null;
		if (token) {
			const normalized = token.toUpperCase();
			const tokenInfo = Object.values(TOKENS).find((t) => t.symbol === normalized);
			if (tokenInfo) {
				// include defined equivalents
				tokenVariants = [...tokenInfo.equivalents];
				// normalize VOI to also include WVOI pools
				if (!tokenVariants.includes('WVOI') && normalized === 'VOI') {
					tokenVariants.push('WVOI');
				}
			} else {
				// Fallback: exact symbol filter (include WVOI when VOI requested)
				tokenVariants = [normalized, ...(normalized === 'VOI' ? ['WVOI'] : [])];
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
			// Use fallback values
			circulatingSupply = '4000000000'; // Approximate fallback
			percentDistributed = '40';
		}

        // If a token is provided, build markets using both MIMIR data and cross-chain snapshots
        let marketData: any[] = [];
        if (token) {
            const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);
            const tokenSym = token.toUpperCase();

            // 1) Find pools containing this token
            const poolsRes = await supabaseMimirClient
                .from('pool_catalog')
                .select('*')
                .or(`token_a_symbol.ilike.${tokenSym},token_b_symbol.ilike.${tokenSym}`);
            if (poolsRes.error) throw poolsRes.error;
            const pools = poolsRes.data || [];

            // Normalize pairs with selected token as base
            const normalizeSymbol = (s: string) => (s?.toUpperCase() === 'WVOI' ? 'VOI' : s);
            const pairs = pools.map((pool: any) => {
                const isTokenBBase = pool.token_b_symbol?.toUpperCase() === tokenSym;
                const baseSide = isTokenBBase
                    ? {
                          baseTokenId: pool.token_b_id,
                          baseSymbol: normalizeSymbol(pool.token_b_symbol),
                          baseDecimals: pool.token_b_decimals
                      }
                    : {
                          baseTokenId: pool.token_a_id,
                          baseSymbol: normalizeSymbol(pool.token_a_symbol),
                          baseDecimals: pool.token_a_decimals
                      };
                const quoteSide = isTokenBBase
                    ? {
                          quoteTokenId: pool.token_a_id,
                          quoteSymbol: normalizeSymbol(pool.token_a_symbol),
                          quoteDecimals: pool.token_a_decimals
                      }
                    : {
                          quoteTokenId: pool.token_b_id,
                          quoteSymbol: normalizeSymbol(pool.token_b_symbol),
                          quoteDecimals: pool.token_b_decimals
                      };

                // Always carry original pool token_a/token_b metadata for accurate TVL math
                return {
                    ...baseSide,
                    ...quoteSide,
                    poolId: pool.pool_id,
                    tokenAId: pool.token_a_id,
                    tokenASymbol: normalizeSymbol(pool.token_a_symbol),
                    tokenADecimals: pool.token_a_decimals,
                    tokenBId: pool.token_b_id,
                    tokenBSymbol: normalizeSymbol(pool.token_b_symbol),
                    tokenBDecimals: pool.token_b_decimals
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
            
            // Fallback to a reasonable VOI price estimate if we can't get good data
            if (!voiUsd || voiUsd <= 0) {
                voiUsd = 0.0007; // Conservative estimate
                console.log('Using fallback VOI price:', voiUsd);
            }
            
            console.log('VOI USD price for conversion:', voiUsd);
            const isUsdLike = (sym: string) => ['USDC', 'AUSDC', 'USDT', 'AUSDT'].includes(sym.toUpperCase());

            // Build USD map for symbols using VOI reference where needed
            const symbols = new Set<string>();
            pairs.forEach((p) => {
                symbols.add((p.baseSymbol || '').toUpperCase());
                symbols.add((p.quoteSymbol || '').toUpperCase());
            });
            const symbolUsd = new Map<string, number>();
            symbolUsd.set('VOI', voiUsd);
            symbolUsd.set('USDC', 1);
            symbolUsd.set('AUSDC', 1);
            symbolUsd.set('USDT', 1);
            symbolUsd.set('AUSDT', 1);

            for (const s of symbols) {
                if (symbolUsd.has(s)) continue;
                // Try to find a VOI pool for symbol s
                const { data: pricePools } = await supabaseMimirClient
                    .from('pool_catalog')
                    .select('pool_id, token_a_symbol, token_b_symbol')
                    .or(`and(token_a_symbol.ilike.${s},token_b_symbol.ilike.VOI),and(token_a_symbol.ilike.VOI,token_b_symbol.ilike.${s})`)
                    .limit(1);
                if (!pricePools || pricePools.length === 0) {
                    symbolUsd.set(s, 0);
                    continue;
                }
                const poolIdForPrice = pricePools[0].pool_id;
                const { data: latestForSym } = await supabaseMimirClient
                    .from('dex_swaps_materialized')
                    .select('price_quote, ts')
                    .eq('pool_id', poolIdForPrice)
                    .order('ts', { ascending: false })
                    .limit(1);
                let priceInVoi = 0;
                if (latestForSym && latestForSym.length > 0) {
                    const pq = Number(latestForSym[0].price_quote || 0);
                    const aSym = (pricePools[0].token_a_symbol || '').toUpperCase();
                    const bSym = (pricePools[0].token_b_symbol || '').toUpperCase();
                    if (aSym === s && bSym === 'VOI') priceInVoi = pq;
                    else if (aSym === 'VOI' && bSym === s && pq > 0) priceInVoi = 1 / pq;
                }
                const usd = priceInVoi > 0 && voiUsd > 0 ? priceInVoi * voiUsd : 0;
                symbolUsd.set(s, usd);
            }

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
            if (tokenSym === 'VOI' || tokenSym === 'WVOI') {
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
                        
                        crossChainSnapshots = Array.from(latestSnapshots.values()).map(snapshot => ({
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
                    
                    console.log(`Reserves for ${pair.tokenASymbol}/${pair.tokenBSymbol} (already in correct decimals):`, {
                        reserveA: reserveTokenA,
                        reserveB: reserveTokenB
                    });
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

            // USD conversion with cross-token support via VOI pools
            function getQuoteUsd(sym: string): number {
                const s = (sym || '').toUpperCase();
                if (s === 'VOI' || s === 'WVOI') return voiUsd;
                if (['USDC', 'AUSDC', 'USDT', 'AUSDT'].includes(s)) return 1;
                // Attempt cross price via VOI pools computed earlier in symbolUsd
                const crossPrice = symbolUsd?.get(s) || 0;
                if (crossPrice === 0) {
                    console.warn(`No USD price found for symbol: ${s}`);
                }
                return crossPrice;
            }
            const qUsd = getQuoteUsd(pair.quoteSymbol);
            const priceUsd = qUsd > 0 ? price * qUsd : 0;
            // Volume calculation 
            const volume24h = qUsd > 0 && volQuoteSum > 0 ? volQuoteSum * qUsd : 0;

            // Debug logging for VOI pairs
            if (pair.baseSymbol.toUpperCase() === 'VOI' || pair.quoteSymbol.toUpperCase() === 'VOI') {
                console.log(`VOI pair ${pair.baseSymbol}/${pair.quoteSymbol}:`, {
                    voiUsd,
                    price,
                    qUsd,
                    priceUsd,
                    volume24h
                });
            }

            // TVL calculation - handle cases where tokens don't have direct USD prices
            let tvl = 0;
            const tokenAUsd = getQuoteUsd(pair.tokenASymbol);
            const tokenBUsd = getQuoteUsd(pair.tokenBSymbol);
            
            if (tokenAUsd > 0 && tokenBUsd > 0) {
                // Both tokens have USD prices
                tvl = reserveTokenA * tokenAUsd + reserveTokenB * tokenBUsd;
            } else if (tokenAUsd > 0) {
                // Only token A has USD price - use it for both sides
                tvl = 2 * (reserveTokenA * tokenAUsd);
            } else if (tokenBUsd > 0) {
                // Only token B has USD price - use it for both sides
                tvl = 2 * (reserveTokenB * tokenBUsd);
            } else {
                // Neither token has USD price - TVL is 0
                tvl = 0;
            }
            
            console.log(`TVL calculation for ${pair.tokenASymbol}/${pair.tokenBSymbol}:`, {
                reserveA: reserveTokenA,
                reserveB: reserveTokenB, 
                tokenAUsd,
                tokenBUsd,
                tvl
            });
                const priceChangePct =
                    firstPrice && lastPrice && firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : null;

                const result = {
                    trading_pair_id: pair.poolId,
                    exchange: 'DEX',
                    pair: `${pair.baseSymbol}/${pair.quoteSymbol}`,
                    type: 'DEX',
                    network: 'Voi',
                    url: null,
                    pool_url: null,
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
                
                // Debug logging for all pairs to identify the issue
                console.log(`Market pair ${pair.baseSymbol}/${pair.quoteSymbol}:`, {
                    poolId: pair.poolId,
                    rawPrice: price,
                    priceUsd: priceUsd,
                    qUsd: qUsd,
                    voiUsd: voiUsd,
                    volume24h: volume24h
                });
                
                return result;
            });
            
            // 6) Combine VOI DEX markets with cross-chain snapshots
            marketData = [...voiDexMarkets, ...crossChainSnapshots];
            
            console.log(`Market data summary for ${tokenSym}:`, {
                voiDexMarkets: voiDexMarkets.length,
                crossChainSnapshots: crossChainSnapshots.length,
                totalMarkets: marketData.length,
                totalTVL: marketData.reduce((sum, m) => sum + (m.tvl || 0), 0),
                individualTVLs: voiDexMarkets.map(m => ({ pair: m.pair, tvl: m.tvl })),
                poolsFound: pairs.length
            });
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
		if (token) {
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
