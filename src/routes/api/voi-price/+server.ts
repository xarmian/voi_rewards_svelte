import { supabasePrivateClient } from '$lib/supabase-server';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface MarketSnapshot {
    exchange_name: string;
    exchange_type: 'CEX' | 'DEX';
    exchange_network: string;
    base_token: string;
    quote_token: string;
    price: number;
    volume_24h: number;
    tvl: number | null;
    high_24h: number | null;
    low_24h: number | null;
    price_change_24h: number | null;
    price_change_percentage_24h: number | null;
    snapshot_time: string;
    exchange_url: string | null;
    pool_url: string | null;
}

export const GET: RequestHandler = async () => {
    try {
        const { data: marketSnapshots, error } = await supabasePrivateClient.rpc('get_latest_market_data');
        
        if (error) throw error;

        // Calculate volume-weighted average price
        const marketsWithPriceAndVolume = marketSnapshots.filter((m: MarketSnapshot) => 
            m.price != null && m.price > 0 && 
            m.volume_24h != null && m.volume_24h > 0
        );
        
        if (marketsWithPriceAndVolume.length === 0) {
            return json({ price: 0 });
        }

        const totalWeightedPrice = marketsWithPriceAndVolume.reduce(
            (sum: number, market: MarketSnapshot) => sum + (market.price * market.volume_24h), 
            0
        );
        
        const totalVolume = marketsWithPriceAndVolume.reduce(
            (sum: number, market: MarketSnapshot) => sum + market.volume_24h, 
            0
        );

        const price = totalVolume > 0 ? totalWeightedPrice / totalVolume : 0;

        return json({ price, lastUpdated: marketSnapshots[0].snapshot_time });
    } catch (error) {
        console.error('Error fetching VOI price:', error);
        return json({ price: 0, lastUpdated: new Date() });
    }
}; 