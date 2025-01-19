import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NautilusPool {
  contractId: number;
  providerId: string;
  poolId: string;
  tokAId: string;
  tokBId: string;
  symbolA: string;
  symbolB: string;
  poolBalA: string;
  poolBalB: string;
  tvlA: string;
  tvlB: string;
  volA: string;
  volB: string;
  apr: string;
  supply: string;
  deleted: number;
  tokADecimals: number;
  tokBDecimals: number;
  tvl: number;
  creator: string;
  mintRound: number;
}

interface NomadexPool {
  id: number;
  alphaId: number;
  alphaType: number;
  betaId: number;
  betaType: number;
  swapFee: string;
  balances: string[];
  volume: string[];
  apr: number;
  online: boolean;
}

interface MarketSnapshot {
  trading_pair_id: number;
  price: number;
  volume_24h: number;
  tvl?: number;
  high_24h?: number;
  low_24h?: number;
  price_change_24h?: number;
  price_change_percentage_24h?: number;
}

interface VestigePool {
  id: number;
  token_id: number;
  application_id: number;
  provider: string;
  created_round: number;
  asset_1_id: number;
  asset_2_id: number;
  volatility: number;
  liquidity: number;
  address: string;
  price: number;
  price1h: number;
  price24h: number;
  volume_1_24h: number;
  volume_2_24h: number;
  fee: number;
  token_ratio: number;
  last_traded: number;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Constants
const MEXC_ACCOUNT = 'CVYHPHOWCIOCVTS4QEUFPFROILQBVFR6HKSJKPTDWN4TDQ7QYAWPKMCVCM';
const ALGOD_SERVER_VOI = 'https://mainnet-api.voi.nodely.dev';

// Helper function to fetch historical price data
async function fetchHistoricalPrice(tradingPairId: number): Promise<number | null> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Query for the closest snapshot to 24 hours ago
    const { data, error } = await supabase
      .from('market_snapshots')
      .select('price')
      .eq('trading_pair_id', tradingPairId)
      .lt('timestamp', twentyFourHoursAgo.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data && data.length > 0 ? data[0].price : null;
  } catch (error) {
    console.error('Error fetching historical price:', error);
    return null;
  }
}

async function fetchMEXCData(): Promise<MarketSnapshot | null> {
  try {
    const MEXC_EXCHANGE_ID = 1;

    // Get or create trading pair ID
    const tradingPairId = await getOrCreateTradingPairId(
      MEXC_EXCHANGE_ID,
      'USDT',
      'VOI',
      'https://www.mexc.com/exchange/VOI_USDT'
    );

    // Fetch MEXC price data
    const mexcResponse = await fetch('https://api.mexc.com/api/v3/ticker/24hr?symbol=VOIUSDT');
    const mexcData = await mexcResponse.json();

    // Fetch MEXC TVL from Algorand account
    const accountResponse = await fetch(`${ALGOD_SERVER_VOI}/v2/accounts/${MEXC_ACCOUNT}`);
    if (!accountResponse.ok) {
      throw new Error(`Failed to fetch account data: ${accountResponse.statusText}`);
    }
    const accountData = await accountResponse.json();
    
    // Get TVL in VOI
    const tvl = accountData.amount / 1e6; // Convert from microVOI to VOI
    
    // Get price in USDT per VOI
    const price = parseFloat(mexcData.lastPrice);

    // Get volume in VOI (baseVolume), default to 0 if undefined
    const volume24h = parseFloat(mexcData.volume) || 0;
    
    return {
      trading_pair_id: tradingPairId,
      price: price,
      volume_24h: volume24h,
      tvl: tvl,
      high_24h: parseFloat(mexcData.highPrice) || undefined,
      low_24h: parseFloat(mexcData.lowPrice) || undefined,
      price_change_24h: parseFloat(mexcData.priceChange) || undefined,
      price_change_percentage_24h: parseFloat(mexcData.priceChangePercent) || undefined
    };
  } catch (error) {
    console.error('Error fetching MEXC data:', error);
    return null;
  }
}

// Helper function to get or create trading pair ID
async function getOrCreateTradingPairId(
  exchangeId: number,
  baseToken: string,
  quoteToken: string,
  poolUrl?: string
): Promise<number> {
  try {
    // First, try to find existing trading pair
    const { data: existingPair, error: findError } = await supabase
      .from('trading_pairs')
      .select('id')
      .eq('exchange_id', exchangeId)
      .eq('base_token', baseToken)
      .eq('quote_token', quoteToken)
      .single();

    if (findError && findError.code !== 'PGRST116') { // PGRST116 is "not found" error
      throw findError;
    }

    if (existingPair) {
      return existingPair.id;
    }

    // If not found, create new trading pair
    const { data: newPair, error: insertError } = await supabase
      .from('trading_pairs')
      .insert({
        exchange_id: exchangeId,
        base_token: baseToken,
        quote_token: quoteToken,
        pool_url: poolUrl
      })
      .select('id')
      .single();

    if (insertError) throw insertError;
    if (!newPair) throw new Error('Failed to create trading pair');

    return newPair.id;
  } catch (error) {
    console.error('Error in getOrCreateTradingPairId:', error);
    throw error;
  }
}

async function fetchHumbleData(): Promise<MarketSnapshot[]> {
  try {
    const HUMBLE_EXCHANGE_ID = 2;
    const response = await fetch('https://mainnet-idx.nautilus.sh/nft-indexer/v1/dex/pools?tokenId=390001');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Humble pool data: ${response.statusText}`);
    }

    const data = await response.json();
    const pools = data.pools as NautilusPool[];

    // Filter for pools where VOI is one of the tokens (tokB is always VOI in these pools)
    const voiPools = pools.filter(p => p.tokBId === '390001' && !p.deleted);

    // Process each pool and create market snapshots
    const snapshots: MarketSnapshot[] = await Promise.all(
      voiPools.map(async (pool) => {
        // Get or create trading pair ID
        const poolUrl = `https://app.humble.sh/pool/${pool.contractId}`;
        const tradingPairId = await getOrCreateTradingPairId(
          HUMBLE_EXCHANGE_ID,
          pool.symbolA,
          'VOI',
          poolUrl
        );

        // Calculate price (token per VOI)
        const price = parseFloat(pool.poolBalA) / parseFloat(pool.poolBalB);

        // Get TVL in VOI
        const tvl = parseFloat(pool.tvlB);

        // Get volume in VOI, default to 0 if undefined
        const volume24h = parseFloat(pool.volB) || 0;

        // Fetch historical price for this pair
        const historicalPrice = await fetchHistoricalPrice(tradingPairId);
        const priceChange24h = historicalPrice !== null ? price - historicalPrice : undefined;
        const priceChangePercentage24h = historicalPrice !== null && historicalPrice !== 0 
          ? ((price - historicalPrice) / historicalPrice) * 100 
          : undefined;

        return {
          trading_pair_id: tradingPairId,
          price: price,
          volume_24h: volume24h,
          tvl: tvl,
          high_24h: undefined,
          low_24h: undefined,
          price_change_24h: priceChange24h,
          price_change_percentage_24h: priceChangePercentage24h
        };
      })
    );

    return snapshots;
  } catch (error) {
    console.error('Error fetching Humble data:', error);
    return [];
  }
}

async function fetchNomadexData(): Promise<MarketSnapshot | null> {
  try {
    const NOMADEX_EXCHANGE_ID = 3;
    const POOL_ID = 411756; // VOI/USDC pool ID
    
    // Fetch pool data from Nomadex API
    const response = await fetch('https://voimain-analytics.nomadex.app/pools');
    if (!response.ok) {
      throw new Error(`Failed to fetch Nomadex data: ${response.statusText}`);
    }
    
    const pools = await response.json();
    const pool = pools.find((p: NomadexPool) => p.id === POOL_ID);
    
    if (!pool) {
      throw new Error(`Could not find pool with ID ${POOL_ID}`);
    }

    // Get or create trading pair ID
    const poolUrl = `https://app.nomadex.app/pool/${POOL_ID}`;
    const tradingPairId = await getOrCreateTradingPairId(
      NOMADEX_EXCHANGE_ID,
      'aUSDC',
      'VOI',
      poolUrl
    );

    // Convert balances from microunits
    const voiBalance = Number(pool.balances[0]) / 1e6; // VOI is alpha (index 0)
    const usdcBalance = Number(pool.balances[1]) / 1e6; // USDC is beta (index 1)

    // Calculate price (USDC per VOI)
    const price = usdcBalance / voiBalance;

    // Get TVL in VOI (alpha token balance * 2 since it's a balanced pool)
    const tvl = voiBalance * 2;

    // Get 24h volume in VOI (alpha token volume), default to 0 if undefined
    const volume24h = (Number(pool.volume[0]) / 1e6) || 0;

    // Fetch historical price for this pair
    const historicalPrice = await fetchHistoricalPrice(tradingPairId);
    const priceChange24h = historicalPrice !== null ? price - historicalPrice : undefined;
    const priceChangePercentage24h = historicalPrice !== null && historicalPrice !== 0 
      ? ((price - historicalPrice) / historicalPrice) * 100 
      : undefined;

    return {
      trading_pair_id: tradingPairId,
      price: price,
      volume_24h: volume24h,
      tvl: tvl,
      high_24h: undefined,
      low_24h: undefined,
      price_change_24h: priceChange24h,
      price_change_percentage_24h: priceChangePercentage24h
    };
  } catch (error) {
    console.error('Error fetching Nomadex data:', error);
    return null;
  }
}

async function fetchTinymanData(): Promise<MarketSnapshot | null> {
  try {
    const TINYMAN_EXCHANGE_ID = 4;
    // VOI-USDC pool on Tinyman (Algorand)
    const poolId = 'D6NWRMDOIBMOTAQABMZQW5FO3E5JS4K3ING73FM3YZVFYPS4DQ4NMSQZNA';

    // Get or create trading pair ID
    const tradingPairId = await getOrCreateTradingPairId(
      TINYMAN_EXCHANGE_ID,
      'USDC',
      'aVOI',
      `https://app.tinyman.org/#/pool/${poolId}`
    );

    // Fetch pool data from Tinyman API
    const response = await fetch(`https://mainnet.analytics.tinyman.org/api/v1/pools/${poolId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch Tinyman data: ${response.statusText}`);
    }
    
    const poolData = await response.json();

    // Verify we're looking at the correct pool
    if (poolData.asset_1.id !== '2320775407' || poolData.asset_2.id !== '31566704') {
      throw new Error('Unexpected asset IDs in pool data');
    }
    
    // Calculate price (USDC per VOI)
    const price = parseFloat(poolData.current_asset_2_reserves) / parseFloat(poolData.current_asset_1_reserves);
    
    // Get TVL in VOI
    const tvl = parseFloat(poolData.current_asset_1_reserves);
    
    // Get 24h volume in VOI, default to 0 if undefined
    const volume24h = parseFloat(poolData.last_day_volume_asset_1) || 0;

    // Fetch historical price for this pair
    const historicalPrice = await fetchHistoricalPrice(tradingPairId);
    const priceChange24h = historicalPrice !== null ? price - historicalPrice : undefined;
    const priceChangePercentage24h = historicalPrice !== null && historicalPrice !== 0 
      ? ((price - historicalPrice) / historicalPrice) * 100 
      : undefined;
    
    return {
      trading_pair_id: tradingPairId,
      price: price,
      volume_24h: volume24h,
      tvl: tvl,
      high_24h: undefined,
      low_24h: undefined,
      price_change_24h: priceChange24h,
      price_change_percentage_24h: priceChangePercentage24h
    };
  } catch (error) {
    console.error('Error fetching Tinyman data:', error);
    return null;
  }
}

async function fetchPactFiData(): Promise<MarketSnapshot | null> {
  try {
    const PACTFI_EXCHANGE_ID = 5;
    // Fetch both pools in parallel
    const [pool1Response, pool2Response] = await Promise.all([
      fetch('https://free-api.vestige.fi/pool/507607'),
      fetch('https://free-api.vestige.fi/pool/560706')
    ]);

    if (!pool1Response.ok || !pool2Response.ok) {
      throw new Error('Failed to fetch one or both PactFi pool data');
    }

    const pool1: VestigePool = await pool1Response.json();
    const pool2: VestigePool = await pool2Response.json();

    // Get or create trading pair ID
    const tradingPairId = await getOrCreateTradingPairId(
      PACTFI_EXCHANGE_ID,
      'USDC',
      'aVOI',
      'https://app.pact.fi/swap'
    );

    // Calculate weighted average price based on VOI liquidity
    const pool1VoiLiquidity = pool1.liquidity / pool1.price; // Convert USDC liquidity to VOI
    const pool2VoiLiquidity = pool2.liquidity / pool2.price;
    const totalVoiLiquidity = pool1VoiLiquidity + pool2VoiLiquidity;

    // Calculate weighted average price (USDC per VOI)
    const price = (pool1.price * pool1VoiLiquidity + pool2.price * pool2VoiLiquidity) / totalVoiLiquidity;

    // Get total TVL in VOI
    const tvl = totalVoiLiquidity;

    // Get total 24h volume in VOI, default to 0 if undefined
    const volume24h = (pool1.volume_1_24h + pool2.volume_1_24h) || 0;

    // Calculate weighted average historical price
    const historicalPrice = await fetchHistoricalPrice(tradingPairId);
    const priceChange24h = historicalPrice !== null ? price - historicalPrice : undefined;
    const priceChangePercentage24h = historicalPrice !== null && historicalPrice !== 0 
      ? ((price - historicalPrice) / historicalPrice) * 100 
      : undefined;

    return {
      trading_pair_id: tradingPairId,
      price: price,
      volume_24h: volume24h,
      tvl: tvl,
      high_24h: undefined,
      low_24h: undefined,
      price_change_24h: priceChange24h,
      price_change_percentage_24h: priceChangePercentage24h
    };
  } catch (error) {
    console.error('Error fetching PactFi data:', error);
    return null;
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Fetch data from all sources in parallel
    const [mexcData, humbleData, nomadexData, tinymanData, pactfiData] = await Promise.all([
      fetchMEXCData(),
      fetchHumbleData(),
      fetchNomadexData(),
      fetchTinymanData(),
      fetchPactFiData()
    ]);

    // Prepare snapshots array, handling both single and multiple snapshot results
    const snapshots = [
      mexcData,
      ...(Array.isArray(humbleData) ? humbleData : [humbleData]),
      nomadexData,
      tinymanData,
      pactfiData
    ].filter((data): data is MarketSnapshot => data !== null);

    if (snapshots.length > 0) {
      // Insert all snapshots
      const { error } = await supabase
        .from('market_snapshots')
        .insert(snapshots);

      if (error) throw error;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        snapshots_count: snapshots.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error in fetch-market-data function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
}); 