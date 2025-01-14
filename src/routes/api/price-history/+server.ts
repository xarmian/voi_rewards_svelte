import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabasePrivateClient } from '$lib/supabase-server';

export const GET: RequestHandler = async ({ url }) => {
    const period = url.searchParams.get('period') || '24h';
    const tradingPairId = url.searchParams.get('trading_pair_id');

    try {
        const { data, error } = await supabasePrivateClient
            .rpc('get_price_history', {
                p_period: period,
                p_trading_pair_id: tradingPairId === 'null' ? null : tradingPairId
            });

        if (error) throw error;

        // Map bucket_time to time in data
        const mappedData = data.map(({ bucket_time, value }: { bucket_time: string, value: number }) => ({
            time: bucket_time,
            value
        }));

        return json(mappedData);
    } catch (error) {
        console.error('Error fetching price history:', error);
        return json({ error: 'Failed to fetch price history' }, { status: 500 });
    }
}; 