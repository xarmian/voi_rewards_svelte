import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabasePrivateClient } from '$lib/supabase-server';
import { fetchCirculatingSupply } from '$lib/utils/voi';
import { TOKENS } from '$lib/utils/tokens';

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

export const GET: RequestHandler = async ({ url }) => {
    try {
        // Get token parameter from URL
        const token = url.searchParams.get('token');
        
        // Get token variants if a token is specified
        let tokenVariants: string[] | null = null;
        if (token) {
            const tokenInfo = Object.values(TOKENS).find(t => t.symbol === token.toUpperCase());
            if (tokenInfo) {
                tokenVariants = tokenInfo.equivalents;
            }
        }

        // Fetch the circulating supply data
        const { circulatingSupply, percentDistributed } = await fetchCirculatingSupply();

        // First get the latest snapshot timestamp
        const { data: latestSnapshot, error: timestampError } = await supabasePrivateClient
            .from('market_snapshots')
            .select('timestamp')
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        if (timestampError) throw timestampError;

        // Build the query
        let query = supabasePrivateClient
            .from('trading_pairs')
            .select(`
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
            `)
            .eq('market_snapshots.timestamp', latestSnapshot.timestamp);

        // Add token filter if specified
        if (tokenVariants && tokenVariants.length > 0) {
            query = query.or(`base_token.in.(${tokenVariants.join(',')}),quote_token.in.(${tokenVariants.join(',')})`);
        }

        // Execute the query
        const { data: marketData, error: marketError } = await query;

        if (marketError) throw marketError;

        // Process market data and sort by volume
        const processedMarketData = ((marketData || []) as unknown as RawTradingPair[])
            .map(market => {
                const latestSnapshot = market.market_snapshots?.[0] || {};
                return {
                    trading_pair_id: market.id,
                    exchange: market.exchange.name,
                    pair: `${market.base_token}/${market.quote_token}`,
                    type: market.exchange.type,
                    network: market.exchange.network,
                    url: null,
                    pool_url: market.pool_url,
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

        // Calculate aggregates
        const aggregates = processedMarketData.reduce((acc, market) => {
            acc.totalVolume = (acc.totalVolume || 0) + (market.volume_24h || 0);
            acc.totalTvl = (acc.totalTvl || 0) + (market.tvl || 0);
            return acc;
        }, { totalVolume: 0, totalTvl: 0 });

        // Calculate volume-weighted average price
        const weightedAveragePrice = processedMarketData.reduce((acc, market) => {
            const volume = market.volume_24h || 0;
            const totalVolume = aggregates.totalVolume;
            if (totalVolume === 0) return acc;
            return acc + (market.price * (volume / totalVolume));
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