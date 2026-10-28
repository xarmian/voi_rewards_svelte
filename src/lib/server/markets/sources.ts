import { supabasePrivateClient } from '$lib/server/supabase';
import type { MimirClient } from '$lib/tokens/equivalents';

// Cross-chain market snapshots, ONLY for VOI (any equivalent is VOI 0 or wVOI 390001). Never throws.
export async function fetchCrossChainSnapshots(
	equivalentIds: number[],
	onFailure: () => void
): Promise<any[]> {
	const voiIds = [0, 390001];
	if (!equivalentIds.some((id) => voiIds.includes(id))) return [];
	try {
		// Get latest snapshots from cross-chain exchanges (Tinyman, PactFi, Uniswap, etc.)
		const { data: snapshots, error: snapshotsError } = await supabasePrivateClient
			.from('market_snapshots')
			.select(
				`
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
                `
			)
			.order('timestamp', { ascending: false })
			.limit(50); // Get recent snapshots

		if (snapshotsError) onFailure();
		if (snapshotsError || !snapshots) return [];

		// Group by trading_pair_id and get the latest for each
		const latestSnapshots = new Map();
		snapshots.forEach((snapshot) => {
			const pairId = snapshot.trading_pair_id;
			if (
				!latestSnapshots.has(pairId) ||
				new Date(snapshot.timestamp) > new Date(latestSnapshots.get(pairId).timestamp)
			) {
				latestSnapshots.set(pairId, snapshot);
			}
		});

		// Filter out Voi network exchanges (Humble, Nomadex) since we get those from MIMIR
		// Also exclude MEXC (trading_pair_id = 1) which is no longer active
		return Array.from(latestSnapshots.values())
			.filter(
				(snapshot) =>
					snapshot.trading_pairs.exchange.network !== 'Voi' && snapshot.trading_pair_id !== 1
			)
			.map((snapshot) => ({
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
	} catch (e) {
		console.warn('Failed to fetch cross-chain snapshots:', e);
		onFailure();
		return [];
	}
}

// The token's Algorand asset id, if it has one (gates the Vestige markets). Never throws.
export async function fetchAlgoAssetId(
	tokenId: number,
	supabaseMimirClient: MimirClient,
	onFailure: () => void
): Promise<number | null> {
	try {
		const { data: tokenData, error: tokenError } = await supabaseMimirClient
			.from('arc200_contracts')
			.select('algo_asset_id')
			.eq('contract_id', tokenId)
			.single();
		if (tokenError && tokenError.code !== 'PGRST116') onFailure();
		return !tokenError && tokenData?.algo_asset_id ? Number(tokenData.algo_asset_id) : null;
	} catch (error) {
		console.error('Error fetching Vestige markets:', error);
		onFailure();
		return null;
	}
}
