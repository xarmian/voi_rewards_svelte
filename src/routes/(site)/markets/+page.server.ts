import { supabasePrivateClient } from '$lib/supabase-server';
import type { PageServerLoad } from './$types';
import { fetchCirculatingSupply } from '$lib/utils/voi';

interface MarketData {
  exchange: string;
  type: 'CEX' | 'DEX';
  network: string;
  pair: string;
  price: number;
  volume_24h: number;
  tvl?: number;
  high_24h?: number;
  low_24h?: number;
  price_change_24h?: number;
  price_change_percentage_24h?: number;
  lastUpdated: Date;
  url?: string;
  pool_url?: string;
}

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

export const load: PageServerLoad = async () => {
  try {
    // Fetch market data and circulating supply in parallel
    const [{ data: marketSnapshots, error }, circulatingSupplyData] = await Promise.all([
      supabasePrivateClient.rpc('get_latest_market_data'),
      fetchCirculatingSupply()
    ]);

    if (error) throw error;

    // Transform the data into our frontend format
    const marketData: MarketData[] = marketSnapshots?.map((snapshot: MarketSnapshot) => ({
      exchange: snapshot.exchange_name,
      type: snapshot.exchange_type,
      network: snapshot.exchange_network,
      pair: `${snapshot.base_token}/${snapshot.quote_token}`,
      price: snapshot.price,
      volume_24h: snapshot.volume_24h,
      tvl: snapshot.tvl ?? undefined,
      high_24h: snapshot.high_24h ?? undefined,
      low_24h: snapshot.low_24h ?? undefined,
      price_change_24h: snapshot.price_change_24h ?? undefined,
      price_change_percentage_24h: snapshot.price_change_percentage_24h ?? undefined,
      lastUpdated: new Date(snapshot.snapshot_time),
      url: snapshot.exchange_url ?? undefined,
      pool_url: snapshot.pool_url ?? undefined
    })) || [];

    // Calculate aggregates
    const totalVolume = marketData.reduce((sum, market) => sum + market.volume_24h, 0);
    const totalTVL = marketData.reduce((sum, market) => sum + (market.tvl || 0), 0);
    const averagePrice = marketData.reduce((sum, market) => sum + market.price, 0) / marketData.length;

    return {
      marketData,
      aggregates: {
        totalVolume,
        totalTVL,
        averagePrice
      },
      circulatingSupply: circulatingSupplyData
    };
  } catch (error) {
    console.error('Error loading market data:', error);
    return {
      marketData: [],
      aggregates: {
        totalVolume: 0,
        totalTVL: 0,
        averagePrice: 0
      },
      circulatingSupply: {
        circulatingSupply: "0",
        distributedSupply: "0",
        percentDistributed: "0",
        lockedAccounts: [],
        distributingAccounts: []
      }
    };
  }
}; 