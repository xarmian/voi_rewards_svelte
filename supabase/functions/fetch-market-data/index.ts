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
    // Fetch MEXC price data
    const mexcResponse = await fetch('https://api.mexc.com/api/v3/ticker/24hr?symbol=VOIUSDT');
    const mexcData = await mexcResponse.json();

    // Fetch MEXC TVL from Algorand account
    const accountResponse = await fetch(`${ALGOD_SERVER_VOI}/v2/accounts/${MEXC_ACCOUNT}`);
    if (!accountResponse.ok) {
      throw new Error(`Failed to fetch account data: ${accountResponse.statusText}`);
    }
    const accountData = await accountResponse.json();
    
    // Calculate TVL: account balance * current price
    const balance = accountData.amount / 1e6; // Convert from microVOI to VOI
    const price = parseFloat(mexcData.lastPrice);
    const tvl = balance * price;
    
    return {
      trading_pair_id: 1, // MEXC VOI/USDT pair
      price: price,
      volume_24h: parseFloat(mexcData.quoteVolume), // Using quote volume (USDT)
      tvl: tvl,
      high_24h: parseFloat(mexcData.highPrice),
      low_24h: parseFloat(mexcData.lowPrice),
      price_change_24h: parseFloat(mexcData.priceChange),
      price_change_percentage_24h: parseFloat(mexcData.priceChangePercent)
    };
  } catch (error) {
    console.error('Error fetching MEXC data:', error);
    return null;
  }
}

// TODO: Implement these functions
async function fetchHumbleData(): Promise<MarketSnapshot | null> {
  try {
    const POOL_ID = 395553;
    const response = await fetch('https://mainnet-idx.nautilus.sh/nft-indexer/v1/dex/pools?tokenId=390001');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Humble pool data: ${response.statusText}`);
    }

    const data = await response.json();
    const pool = data.pools.find((p: NautilusPool) => p.contractId === POOL_ID);

    if (!pool) {
      throw new Error(`Could not find Humble pool with ID ${POOL_ID}`);
    }

    // Parse balances and calculate price (USDC per VOI)
    const usdcBalance = parseFloat(pool.poolBalA);
    const voiBalance = parseFloat(pool.poolBalB);
    const price = usdcBalance / voiBalance;

    // Get 24h volume in VOI and convert to USDC
    const volumeVOI = parseFloat(pool.volA) + parseFloat(pool.volB);
    const volume24h = volumeVOI * price;

    // Get TVL in VOI and convert to USDC
    const tvlVOI = parseFloat(pool.tvlB);
    const tvl = tvlVOI * price;

    // Fetch historical price and calculate price change
    const historicalPrice = await fetchHistoricalPrice(2); // Humble trading_pair_id = 2
    const priceChange24h = historicalPrice !== null ? price - historicalPrice : undefined;
    const priceChangePercentage24h = historicalPrice !== null && historicalPrice !== 0 
      ? ((price - historicalPrice) / historicalPrice) * 100 
      : undefined;

    return {
      trading_pair_id: 2, // Humble VOI/USDC pair
      price: price,
      volume_24h: volume24h,
      tvl: tvl,
      high_24h: undefined,
      low_24h: undefined,
      price_change_24h: priceChange24h,
      price_change_percentage_24h: priceChangePercentage24h
    };
  } catch (error) {
    console.error('Error fetching Humble data:', error);
    return null;
  }
}

async function fetchNomadexData(): Promise<MarketSnapshot | null> {
  try {
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

    // Convert balances from microunits
    const voiBalance = Number(pool.balances[0]) / 1e6; // VOI is alpha (index 0)
    const usdcBalance = Number(pool.balances[1]) / 1e6; // USDC is beta (index 1)

    // Calculate price (USDC per VOI)
    const price = usdcBalance / voiBalance;

    // Calculate TVL in USD (multiply by 2 since it's a balanced pool)
    const tvl = usdcBalance * 2;

    // Get 24h volume in USDC (beta token volume)
    const volume24h = Number(pool.volume[1]) / 1e6;

    // Fetch historical price and calculate price change
    const historicalPrice = await fetchHistoricalPrice(3); // Nomadex trading_pair_id = 3
    const priceChange24h = historicalPrice !== null ? price - historicalPrice : undefined;
    const priceChangePercentage24h = historicalPrice !== null && historicalPrice !== 0 
      ? ((price - historicalPrice) / historicalPrice) * 100 
      : undefined;

    return {
      trading_pair_id: 3, // Nomadex VOI/USDC pair
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
    // VOI-USDC pool on Tinyman (Algorand)
    const poolId = 'D6NWRMDOIBMOTAQABMZQW5FO3E5JS4K3ING73FM3YZVFYPS4DQ4NMSQZNA';

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
    
    // Get TVL in USD (sum of both assets in USD)
    const tvl = parseFloat(poolData.liquidity_in_usd);
    
    // Get 24h volume in USD
    const volume24h = parseFloat(poolData.last_day_volume_in_usd);

    // Fetch historical price and calculate price change
    const historicalPrice = await fetchHistoricalPrice(4); // Tinyman trading_pair_id = 4
    const priceChange24h = historicalPrice !== null ? price - historicalPrice : undefined;
    const priceChangePercentage24h = historicalPrice !== null && historicalPrice !== 0 
      ? ((price - historicalPrice) / historicalPrice) * 100 
      : undefined;
    
    return {
      trading_pair_id: 4, // Tinyman VOI/USDC pair
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

    // Use the larger pool's price as the reference price
    const pool1Weight = pool1.liquidity;
    const pool2Weight = pool2.liquidity;
    const totalLiquidity = pool1Weight + pool2Weight;

    // Calculate weighted average price
    const price = (pool1.price * pool1Weight + pool2.price * pool2Weight) / totalLiquidity;

    // Sum volumes and TVL from both pools
    const volume24h = pool1.volume_2_24h + pool2.volume_2_24h;
    const tvl = pool1.liquidity + pool2.liquidity;

    // Calculate weighted average historical price
    const price24h = (pool1.price24h * pool1Weight + pool2.price24h * pool2Weight) / totalLiquidity;

    // Calculate price changes based on weighted averages
    const priceChange24h = price - price24h;
    const priceChangePercentage24h = ((price - price24h) / price24h) * 100;

    return {
      trading_pair_id: 5, // PactFi VOI/USDC pair
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

    // Filter out null results and prepare for insertion
    const snapshots = [mexcData, humbleData, nomadexData, tinymanData, pactfiData]
      .filter((data): data is MarketSnapshot => data !== null);

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