import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import algosdk from 'https://esm.sh/algosdk@2.7.0';
import { swap as Contract } from 'https://esm.sh/ulujs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Constants
const MEXC_ACCOUNT = 'CVYHPHOWCIOCVTS4QEUFPFROILQBVFR6HKSJKPTDWN4TDQ7QYAWPKMCVCM';
const ALGOD_SERVER_VOI = 'https://mainnet-api.voi.nodely.dev';
const ALGOD_SERVER_ALGORAND = 'https://mainnet-idx.4160.nodely.dev';

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
 
    // Initialize algod client
    const algod = new algosdk.Algodv2('', ALGOD_SERVER_VOI, '');

    // Initialize contract with minimal options
    const opts = {
      simulate: false,
      waitForConfirmation: false
    };

    // Get pool info
    const ctc = new Contract(POOL_ID, algod, undefined, opts);
    const ret = await ctc.Info();
    if (!ret.success) {
      throw new Error(`Failed to get pool info for Humble pool ${POOL_ID}`);
    }

    const info = ret.returnValue;
    const voiBalance = Number(info.poolBals.B) / 1e6; // Convert from microVOI
    const usdcBalance = Number(info.poolBals.A) / 1e6; // Convert from microUSDC

    // Calculate price (USDC per VOI)
    const price = usdcBalance / voiBalance;

    // Calculate TVL in USD (multiply by 2 since it's a balanced pool)
    const tvl = usdcBalance * 2;

    // Fetch historical price and calculate price change
    const historicalPrice = await fetchHistoricalPrice(2); // Humble trading_pair_id = 2
    const priceChange24h = historicalPrice !== null ? price - historicalPrice : undefined;
    const priceChangePercentage24h = historicalPrice !== null && historicalPrice !== 0 
      ? ((price - historicalPrice) / historicalPrice) * 100 
      : undefined;

    return {
      trading_pair_id: 2, // Humble VOI/USDC pair
      price: price,
      volume_24h: 0, // Not available from contract info
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
    const POOL_ACCOUNT = '3UL4DIAQ6FKXHC7BZQSBQRMY6CT2KWCMRSM5AOHVAIULE2MYSJ3WKBRA2Q';
    const VOI_ASSET_ID = 2320775407;
    const USDC_ASSET_ID = 31566704;

    // Fetch pool account information
    const accountResponse = await fetch(`${ALGOD_SERVER_ALGORAND}/v2/accounts/${POOL_ACCOUNT}`);
    if (!accountResponse.ok) {
      throw new Error(`Failed to fetch pool account data: ${accountResponse.statusText}`);
    }
    const accountData = await accountResponse.json();

    // Find VOI and USDC balances in the assets array
    let voiBalance = 0;
    let usdcBalance = 0;

    // Check other assets
    for (const asset of accountData.account.assets || []) {
      if (asset['asset-id'] === VOI_ASSET_ID) {
        voiBalance = asset.amount;
      } else if (asset['asset-id'] === USDC_ASSET_ID) {
        usdcBalance = asset.amount;
      }
    }

    if (voiBalance === 0 || usdcBalance === 0) {
      throw new Error('Could not find both asset balances in pool');
    }

    // Convert from microVOI and microUSDC to VOI and USDC
    const voiAmount = voiBalance / 1e6;
    const usdcAmount = usdcBalance / 1e6;

    // Calculate price (USDC per VOI)
    const price = usdcAmount / voiAmount;

    // Calculate TVL in USD (multiply by 2 since it's a balanced pool)
    const tvl = usdcAmount * 2;

    // Fetch historical price and calculate price change
    const historicalPrice = await fetchHistoricalPrice(5); // PactFi trading_pair_id = 5
    const priceChange24h = historicalPrice !== null ? price - historicalPrice : undefined;
    const priceChangePercentage24h = historicalPrice !== null && historicalPrice !== 0 
      ? ((price - historicalPrice) / historicalPrice) * 100 
      : undefined;

    return {
      trading_pair_id: 5, // PactFi VOI/USDC pair
      price: price,
      volume_24h: 0, // Not available from account data
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