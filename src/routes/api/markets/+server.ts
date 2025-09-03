import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabasePrivateClient } from '$lib/supabase-server';
import { fetchCirculatingSupply } from '$lib/utils/voi';
import { TOKENS } from '$lib/utils/tokens';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';
import { fetchVestigeMarketsForAsset } from '$lib/utils/vestige';

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
		}

        // If a token is provided, build markets using both MIMIR data and cross-chain snapshots
        let marketData: any[] = [];
        if (token) {
            const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);
            const tokenSym = token.toUpperCase();

            // 1) Find pools containing this token
            const poolsRes = await supabaseMimirClient
                .from('pool_catalog')
                .select('*, exchange, token_a_type, token_b_type')
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
                    exchange: pool.exchange || 'DEX',
                    tokenAId: pool.token_a_id,
                    tokenASymbol: normalizeSymbol(pool.token_a_symbol),
                    tokenADecimals: pool.token_a_decimals,
                    tokenAType: pool.token_a_type,
                    tokenBId: pool.token_b_id,
                    tokenBSymbol: normalizeSymbol(pool.token_b_symbol),
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
            
            console.log('VOI USD price for conversion:', voiUsd);
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

            // Step 2: Get all pool prices for path finding
            const poolPrices = new Map<string, { price: number, tokenA: string, tokenB: string }>();
            
            // Fetch latest prices for all pools we're interested in
            for (const pair of pairs) {
                const latest = latestByPool.get(pair.poolId);
                if (latest) {
                    const p = Number(latest.price_quote || 0);
                    if (p > 0) {
                        // Store price as tokenA per tokenB (based on what's in the swap data)
                        const keyAB = `${pair.tokenASymbol}_${pair.tokenBSymbol}`;
                        const keyBA = `${pair.tokenBSymbol}_${pair.tokenASymbol}`;
                        
                        // Debug for UNIT/SHELLY specifically
                        const isUnitShelly = (pair.tokenASymbol === 'UNIT' && pair.tokenBSymbol === 'SHELLY') || 
                                           (pair.tokenASymbol === 'SHELLY' && pair.tokenBSymbol === 'UNIT');
                        
                        // Price_quote represents base_token per quote_token
                        if (latest.base_token_id === pair.tokenAId && latest.quote_token_id === pair.tokenBId) {
                            poolPrices.set(keyAB, { price: p, tokenA: pair.tokenASymbol, tokenB: pair.tokenBSymbol });
                            poolPrices.set(keyBA, { price: 1/p, tokenA: pair.tokenBSymbol, tokenB: pair.tokenASymbol });
                            if (isUnitShelly) {
                                console.log(`🔍 UNIT/SHELLY Pool ${pair.poolId}: raw data shows base_token_id=${latest.base_token_id} (${pair.tokenASymbol}), quote_token_id=${latest.quote_token_id} (${pair.tokenBSymbol})`);
                                console.log(`🔍 Raw price_quote=${p} means 1 ${pair.tokenASymbol} = ${p} ${pair.tokenBSymbol}`);
                                console.log(`🔍 Setting ${keyAB} = ${p}, ${keyBA} = ${1/p}`);
                            }
                        } else if (latest.base_token_id === pair.tokenBId && latest.quote_token_id === pair.tokenAId) {
                            poolPrices.set(keyBA, { price: p, tokenA: pair.tokenBSymbol, tokenB: pair.tokenASymbol });
                            poolPrices.set(keyAB, { price: 1/p, tokenA: pair.tokenASymbol, tokenB: pair.tokenBSymbol });
                            if (isUnitShelly) {
                                console.log(`🔍 UNIT/SHELLY Pool ${pair.poolId}: raw data shows base_token_id=${latest.base_token_id} (${pair.tokenBSymbol}), quote_token_id=${latest.quote_token_id} (${pair.tokenASymbol})`);
                                console.log(`🔍 Raw price_quote=${p} means 1 ${pair.tokenBSymbol} = ${p} ${pair.tokenASymbol}`);
                                console.log(`🔍 Setting ${keyBA} = ${p}, ${keyAB} = ${1/p}`);
                            }
                        }
                    }
                }
            }

            // Step 3: First pass - direct VOI pairs
            for (const [key, priceInfo] of poolPrices) {
                if (priceInfo.tokenB === 'VOI' && !priceInVoi.has(priceInfo.tokenA)) {
                    priceInVoi.set(priceInfo.tokenA, priceInfo.price);
                    console.log(`Direct VOI price: ${priceInfo.tokenA} = ${priceInfo.price} VOI`);
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
                        console.log(`Multi-hop price (iteration ${iterations}): ${tokenA} = ${newPrice} VOI (${tokenBVoiPrice} VOI per ${tokenB} × ${price} ${tokenA} per ${tokenB})`);
                        
                        // Special debug for UNIT/SHELLY
                        if ((tokenA === 'UNIT' && tokenB === 'SHELLY') || (tokenA === 'SHELLY' && tokenB === 'UNIT')) {
                            console.log(`🔍 UNIT/SHELLY multi-hop: calculating ${tokenA} price`);
                            console.log(`🔍 ${tokenB} price in VOI: ${tokenBVoiPrice}`);
                            console.log(`🔍 ${tokenA} per ${tokenB}: ${price}`);
                            console.log(`🔍 ${tokenA} price in VOI: ${tokenBVoiPrice} × ${price} = ${newPrice}`);
                        }
                        
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
                    console.log(`Final USD price: ${symbol} = $${usdPrice.toFixed(8)} (${voiPrice} VOI * $${voiUsd})`);
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

            // USD conversion using comprehensive price resolution
            const qUsd = symbolUsd.get(pair.quoteSymbol) || 0;
            const baseUsd = symbolUsd.get(pair.baseSymbol) || 0;
            
            // Calculate price in USD: (quote tokens per base token) * (USD per quote token)
            let priceUsd = 0;
            if (qUsd > 0 && price > 0) {
                priceUsd = price * qUsd;
            } else if (baseUsd > 0 && price > 0) {
                // Fallback: if we don't have quote USD but have base USD, calculate differently
                // This shouldn't normally happen with our comprehensive pricing, but as backup
                priceUsd = baseUsd / price;
            }
            
            // Volume calculation using quote token USD value
            const volume24h = qUsd > 0 && volQuoteSum > 0 ? volQuoteSum * qUsd : 0;

            // Enhanced debug logging for all pairs
            console.log(`Price calculation for ${pair.baseSymbol}/${pair.quoteSymbol}:`, {
                rawPrice: price,
                baseUsd: baseUsd,
                qUsd: qUsd,
                priceUsd: priceUsd,
                volume24h: volume24h,
                volQuoteSum: volQuoteSum
            });

            // TVL calculation using comprehensive price resolution
            let tvl = 0;
            const tokenAUsd = symbolUsd.get(pair.tokenASymbol) || 0;
            const tokenBUsd = symbolUsd.get(pair.tokenBSymbol) || 0;
            const tokenAVoi = priceInVoi.get(pair.tokenASymbol) || 0;
            const tokenBVoi = priceInVoi.get(pair.tokenBSymbol) || 0;
            
            if (tokenAUsd > 0 && tokenBUsd > 0) {
                // Both tokens have USD prices - use actual values
                tvl = reserveTokenA * tokenAUsd + reserveTokenB * tokenBUsd;
                console.log(`TVL (both USD): ${pair.tokenASymbol}(${reserveTokenA} * $${tokenAUsd}) + ${pair.tokenBSymbol}(${reserveTokenB} * $${tokenBUsd}) = $${tvl}`);
            } else if (tokenAVoi > 0 && tokenBVoi > 0) {
                // Both tokens have VOI prices - calculate total VOI value then convert to USD
                const totalVoi = reserveTokenA * tokenAVoi + reserveTokenB * tokenBVoi;
                tvl = totalVoi * voiUsd;
                console.log(`TVL (both VOI): ${pair.tokenASymbol}(${reserveTokenA} * ${tokenAVoi} VOI) + ${pair.tokenBSymbol}(${reserveTokenB} * ${tokenBVoi} VOI) = ${totalVoi} VOI = $${tvl}`);
            } else if (tokenAVoi > 0 || tokenBVoi > 0) {
                // Only one token has price - assume balanced pool and double the known side
                const knownSideVoi = tokenAVoi > 0 
                    ? reserveTokenA * tokenAVoi 
                    : reserveTokenB * tokenBVoi;
                tvl = knownSideVoi * 2 * voiUsd;
                console.log(`TVL (one side): Using ${tokenAVoi > 0 ? pair.tokenASymbol : pair.tokenBSymbol} side (${knownSideVoi} VOI) * 2 = $${tvl}`);
            } else {
                // No price information available
                tvl = 0;
                console.log(`TVL: No price information for ${pair.tokenASymbol}/${pair.tokenBSymbol}`);
            }
            
            console.log(`Final TVL for ${pair.tokenASymbol}/${pair.tokenBSymbol}:`, {
                reserveA: reserveTokenA,
                reserveB: reserveTokenB,
                tokenAUsd: tokenAUsd,
                tokenBUsd: tokenBUsd,
                tokenAVoi: tokenAVoi,
                tokenBVoi: tokenBVoi,
                voiUsd: voiUsd,
                finalTvl: tvl
            });
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
                
                // Comprehensive debug logging for market pair
                console.log(`Final market data for ${pair.baseSymbol}/${pair.quoteSymbol}:`, {
                    poolId: pair.poolId,
                    rawPrice: price,
                    priceUsd: priceUsd,
                    volume24h: volume24h,
                    tvl: tvl,
                    baseSymbol: pair.baseSymbol,
                    quoteSymbol: pair.quoteSymbol,
                    baseUsd: baseUsd,
                    qUsd: qUsd,
                    reserveA: reserveTokenA,
                    reserveB: reserveTokenB,
                    voiUsd: voiUsd
                });
                
                return result;
            });
            
            // 6) Fetch Vestige (Algorand) markets if token has algo_asset_id
            let vestigeMarkets: any[] = [];
            try {
                // Check if the selected token has an algo_asset_id
                const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);
                const { data: tokenData, error: tokenError } = await supabaseMimirClient
                    .from('arc200_contracts')
                    .select('algo_asset_id')
                    .ilike('symbol', tokenSym)
                    .single();

                if (!tokenError && tokenData && tokenData.algo_asset_id) {
                    console.log(`Token ${tokenSym} has algo_asset_id: ${tokenData.algo_asset_id}, fetching Vestige markets`);
                    // Create a price map from our symbol USD prices for TVL calculation
                    const priceMapForVestige = new Map<string, number>();
                    for (const [symbol, usdPrice] of symbolUsd) {
                        if (usdPrice > 0) {
                            priceMapForVestige.set(symbol, usdPrice);
                        }
                    }
                    vestigeMarkets = await fetchVestigeMarketsForAsset(tokenData.algo_asset_id, priceMapForVestige);
                    console.log(`Fetched ${vestigeMarkets.length} Vestige markets for ${tokenSym}`);
                } else {
                    console.log(`Token ${tokenSym} has no algo_asset_id, skipping Vestige markets`);
                }
            } catch (error) {
                console.error('Error fetching Vestige markets:', error);
                // Continue without Vestige data
            }

            // 7) Combine VOI DEX markets with cross-chain snapshots and Vestige markets
            marketData = [...voiDexMarkets, ...crossChainSnapshots, ...vestigeMarkets];
            
            console.log(`Market data summary for ${tokenSym}:`, {
                voiDexMarkets: voiDexMarkets.length,
                crossChainSnapshots: crossChainSnapshots.length,
                vestigeMarkets: vestigeMarkets.length,
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
