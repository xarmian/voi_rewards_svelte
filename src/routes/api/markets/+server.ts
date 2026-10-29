import { CACHE_TTL, publicCache } from '$lib/server/httpCache';
import { withDeadline } from '$lib/server/fetchWithTimeout';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabasePrivateClient } from '$lib/server/supabase';
import { fetchCirculatingSupply } from '$lib/utils/voi';
import { mimirClient as supabaseMimirClient } from '$lib/mimir';
import { getTokenEquivalents } from '$lib/tokens/equivalents';
import { fetchVestigeMarketsForAsset } from '$lib/utils/vestige';
import { fetchPoolAggregates } from '$lib/server/poolAggregates';
import { resolveVoiUsd } from '$lib/server/voiUsdReference';
import type { VoiUsdStatus } from '$lib/server/voiUsdReference';

import { fetchCrossChainSnapshots, fetchAlgoAssetId } from '$lib/server/markets/sources';
import { normalizePairs } from '$lib/server/markets/pairs';
import { latestSwapsByPool, resolveSymbolUsd, vestigePriceMap } from '$lib/server/markets/priceMap';
import {
	composeDexMarketRow,
	legacyMarketRows,
	sortByVolume,
	marketAggregates
} from '$lib/server/markets/rows';

// Measured circulating-supply upstream latency: 0.12-0.27 s.
const SUPPLY_TIMEOUT_MS = 3000;

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

		// Circulating supply depends on nothing else: start it now, await it where the response is built (TASK-27)
		const supplyPromise = withDeadline(
			(signal) => fetchCirculatingSupply({ signal }),
			SUPPLY_TIMEOUT_MS
		).catch((error) => {
			console.error('Failed to fetch circulating supply:', error);
			// TASK-55: this upstream fails on prod; its supply fallback must not disable markets caching.
			return { circulatingSupply: '0', percentDistributed: '0' };
		});
		const supplyResponse = async () => {
			const { circulatingSupply, percentDistributed } = await supplyPromise;
			return {
				circulatingSupply: parseFloat(circulatingSupply),
				percentDistributed: parseFloat(percentDistributed)
			};
		};

		// If a tokenId is provided, build markets using both MIMIR data and cross-chain snapshots
		let degraded = false;
		const onFailure = () => {
			degraded = true;
		};
		let marketData: any[] = [];
		let voiUsd: number | null = null;
		// null = no VOI/USD conversion was attempted (no pools, or no tokenId), so nothing to flag
		let voiUsdStatus: VoiUsdStatus | null = null;
		let voiUsdAsOf: string | null = null;
		if (tokenId !== null) {
			// Get all equivalent token IDs (handles wrapped/native mappings)
			const equivalents = await getTokenEquivalents(tokenId, supabaseMimirClient);
			if (equivalents.failed) onFailure();
			const equivalentIds = [tokenId, ...equivalents.ids];

			// 1) Find pools containing any of the equivalent token IDs
			const orConditions = equivalentIds
				.flatMap((id) => [`token_a_id.eq.${id}`, `token_b_id.eq.${id}`])
				.join(',');
			const poolsRes = await supabaseMimirClient.from('pool_catalog').select('*').or(orConditions);
			if (poolsRes.error) throw poolsRes.error;

			const pairs = normalizePairs(poolsRes.data, equivalentIds);

			if (pairs.length === 0) {
				return json(
					{
						marketData: [],
						voiUsd,
						voiUsdStatus,
						voiUsdAsOf,
						aggregates: { totalVolume: 0, totalTvl: 0, weightedAveragePrice: 0 },
						circulatingSupply: await supplyResponse()
					},
					{
						headers: degraded
							? undefined
							: publicCache(CACHE_TTL.markets.sMaxAge, CACHE_TTL.markets.staleWhileRevalidate)
					}
				);
			}

			// TASK-27: everything below depends only on the pools (or only on the token), so these
			// reads run together. Each keeps its own failure handling; Vestige still waits for symbolUsd.
			const [voiUsdRef, poolAggregates, crossChainSnapshots, algoAssetId] = await Promise.all([
				// VOI USD reference - get from price history which uses proper sources
				(async () => {
					try {
						const refRes = await fetch(`${url.origin}/api/price-history?period=24h&token=VOI`);
						return resolveVoiUsd(refRes.ok ? await refRes.json() : null);
					} catch {
						return { voiUsd: null, status: 'unavailable' as const, asOf: null };
					}
				})(),
				// TASK-52, C11, P06: share pool aggregates for latest swaps and the 24h window.
				fetchPoolAggregates(
					supabaseMimirClient,
					pairs.map((p) => p.poolId)
				),
				fetchCrossChainSnapshots(equivalentIds, onFailure),
				fetchAlgoAssetId(tokenId, supabaseMimirClient, onFailure)
			]);
			({ voiUsd, status: voiUsdStatus, asOf: voiUsdAsOf } = voiUsdRef);
			if (voiUsdStatus !== 'ok') {
				console.warn('VOI USD reference status:', voiUsdStatus);
			}
			const voiUsdForMath = voiUsd ?? 0;

			const latestByPool = latestSwapsByPool(poolAggregates);
			const symbolUsd = resolveSymbolUsd(pairs, latestByPool, voiUsdForMath);

			// 5) Compose market rows from MIMIR DEX data
			const voiDexMarkets = pairs.map((pair) =>
				composeDexMarketRow(
					pair,
					latestByPool.get(pair.poolId),
					poolAggregates.get(pair.poolId),
					symbolUsd
				)
			);

			// 6) Fetch Vestige (Algorand) markets if token has algo_asset_id
			let vestigeMarkets: any[] = [];
			try {
				if (algoAssetId) {
					const priceMapForVestige = vestigePriceMap(symbolUsd);
					vestigeMarkets = await fetchVestigeMarketsForAsset(
						algoAssetId,
						priceMapForVestige,
						onFailure
					);
				} else {
					console.log(`Token ${tokenId} has no algo_asset_id, skipping Vestige markets`);
				}
			} catch (error) {
				console.error('Error fetching Vestige markets:', error);
				onFailure();
				// Continue without Vestige data
			}

			// 7) Combine VOI DEX markets with cross-chain snapshots and Vestige markets
			marketData = [...voiDexMarkets, ...crossChainSnapshots, ...vestigeMarkets];
		} else {
			// Legacy: general list using platform snapshots
			// Exclude MEXC (id = 1) which is no longer active
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
				.neq('id', 1)
				.order('timestamp', { foreignTable: 'market_snapshots', ascending: false })
				.limit(1, { foreignTable: 'market_snapshots' });

			const { data, error } = await query;
			if (error) throw error;
			marketData = data as any[];
		}

		// Process market data and sort by volume
		let processedMarketData: any[] = [];
		if (tokenId !== null) {
			processedMarketData = sortByVolume(marketData);
		} else {
			processedMarketData = legacyMarketRows(marketData);
		}

		const aggregates = marketAggregates(processedMarketData);

		return json(
			{
				marketData: processedMarketData,
				voiUsd,
				voiUsdStatus,
				voiUsdAsOf,
				aggregates,
				circulatingSupply: await supplyResponse()
			},
			{
				headers:
					!degraded && voiUsdStatus !== 'unavailable' && voiUsdStatus !== 'invalid'
						? publicCache(CACHE_TTL.markets.sMaxAge, CACHE_TTL.markets.staleWhileRevalidate)
						: undefined
			}
		);
	} catch (error) {
		console.error('Error fetching market data:', error);
		return json({ error: 'Failed to fetch market data' }, { status: 500 });
	}
};
