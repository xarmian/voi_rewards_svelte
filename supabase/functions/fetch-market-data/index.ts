import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { ethers } from 'https://esm.sh/ethers@6.9.0';

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

interface SwapEvent {
  args: {
    amount0: bigint;
    amount1: bigint;
    sender: string;
    recipient: string;
    sqrtPriceX96: bigint;
    liquidity: bigint;
    tick: number;
  };
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Constants
const MEXC_ACCOUNT = 'CVYHPHOWCIOCVTS4QEUFPFROILQBVFR6HKSJKPTDWN4TDQ7QYAWPKMCVCM';
const ALGOD_SERVER_VOI = 'https://mainnet-api.voi.nodely.dev';

// Define the Uniswap V3 Pool ABI inline since we can't import it
const IUniswapV3PoolABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
];

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
      price_change_percentage_24h: parseFloat(mexcData.priceChangePercent) * 100
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
    const tvl = tvlVOI * price * 2;

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

async function fetchUniswapData(): Promise<MarketSnapshot | null> {
  try {
    const POOL_ADDRESS = '0x11DeE17647b8cC8d1b6897D8f3CdFB50d6A11685';
    const BASE_RPC = 'https://mainnet.base.org';
    const CHUNK_SIZE = 9000; // Stay under 10k limit with some buffer
    
    // Initialize provider and contract
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const poolContract = new ethers.Contract(POOL_ADDRESS, IUniswapV3PoolABI, provider);

    // Get current block
    const currentBlock = await provider.getBlockNumber();
    
    // Calculate block from ~24 hours ago (assuming 2 second block time on Base)
    const blocksIn24Hours = Math.floor(24 * 60 * 60 / 2);
    const fromBlock = currentBlock - blocksIn24Hours;

    // Fetch pool data
    const [slot0, token0, token1] = await Promise.all([
      poolContract.slot0(),
      poolContract.token0(),
      poolContract.token1()
    ]);

    // Fetch swap events in chunks
    const swapEvents: SwapEvent[] = [];
    let startBlock = fromBlock;
    while (startBlock < currentBlock) {
      const endBlock = Math.min(startBlock + CHUNK_SIZE, currentBlock);
      const events = await poolContract.queryFilter(
        poolContract.filters.Swap(),
        startBlock,
        endBlock
      ) as SwapEvent[];
      swapEvents.push(...events);
      startBlock = endBlock + 1;
      
      // Add a small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Get token contracts to fetch decimals and balances
    const token0Contract = new ethers.Contract(
      token0,
      ['function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)'],
      provider
    );
    const token1Contract = new ethers.Contract(
      token1,
      ['function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)'],
      provider
    );

    const [decimals0, decimals1, balance0, balance1] = await Promise.all([
      token0Contract.decimals(),
      token1Contract.decimals(),
      token0Contract.balanceOf(POOL_ADDRESS),
      token1Contract.balanceOf(POOL_ADDRESS)
    ]);

    // Calculate price from sqrtPriceX96
    const sqrtPriceX96 = BigInt(slot0.sqrtPriceX96.toString());
    const Q96 = BigInt(2) ** BigInt(96);
    
    // Calculate price maintaining BigInt precision
    // Note: token0 is VOI, token1 is USDC, so we need to invert the price
    const decimalAdjustment = BigInt(10) ** BigInt(decimals1 - decimals0);
    const priceNumerator = Q96 * Q96;
    const priceDenominator = sqrtPriceX96 * sqrtPriceX96 * decimalAdjustment;
    const price = Number(priceNumerator) / Number(priceDenominator);

    // Calculate 24h volume
    let volume24h = 0;
    for (const event of swapEvents) {
      // Convert amounts to proper decimals using BigInt arithmetic
      const amount0BigInt = BigInt(event.args?.amount0?.toString() || '0');
      const amount1BigInt = BigInt(event.args?.amount1?.toString() || '0');
      
      // Convert to decimal values using BigInt division
      const amount0Decimal = Number(amount0BigInt) / Math.pow(10, Number(decimals0));
      const amount1Decimal = Number(amount1BigInt) / Math.pow(10, Number(decimals1));
      
      // If amount0 is negative, it means token0 (USDC) is being swapped out
      // If amount0 is positive, it means token0 (USDC) is being swapped in
      if (amount0BigInt < BigInt(0)) {
        // USDC being swapped out - use absolute USDC amount
        volume24h += Math.abs(amount0Decimal);
      } else {
        // VOI being swapped out - convert VOI to USDC value
        volume24h += Math.abs(amount1Decimal) * price;
      }
    }

    // Calculate TVL in USDC using actual token balances
    // Convert everything to BigInt first to avoid precision loss
    const balance0BigInt = BigInt(balance0.toString());
    const balance1BigInt = BigInt(balance1.toString());
    
    // Convert price to BigInt with 18 decimals of precision
    const priceScaled = BigInt(Math.round(price * 1e18));
    
    // Calculate VOI value in USDC (all in BigInt)
    const voiValueScaled = (balance1BigInt * priceScaled) / (BigInt(10) ** BigInt(decimals1));
    const voiValue = Number(voiValueScaled) / 1e18;
    
    // Calculate USDC value (all in BigInt first)
    const usdcValueScaled = balance0BigInt / (BigInt(10) ** BigInt(decimals0));
    const usdcValue = Number(usdcValueScaled);
    
    // Sum the values
    const tvl = voiValue + usdcValue;

    // Fetch historical price and calculate price change
    const historicalPrice = await fetchHistoricalPrice(22); // Uniswap trading_pair_id = 22
    const priceChange24h = historicalPrice !== null ? price - historicalPrice : undefined;
    const priceChangePercentage24h = historicalPrice !== null && historicalPrice !== 0 
      ? ((price - historicalPrice) / historicalPrice) * 100 
      : undefined;

    return {
      trading_pair_id: 22, // Uniswap VOI/USDC pair
      price: price,
      volume_24h: volume24h,
      tvl: tvl,
      high_24h: undefined,
      low_24h: undefined,
      price_change_24h: priceChange24h,
      price_change_percentage_24h: priceChangePercentage24h
    };
  } catch (error) {
    console.error('Error fetching Uniswap data:', error);
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
    const [mexcData, humbleData, tinymanData, pactfiData, uniswapData] = await Promise.all([
      fetchMEXCData(),
      fetchHumbleData(),
      fetchTinymanData(),
      fetchPactFiData(),
      fetchUniswapData()
    ]);

    // Filter out null results and prepare for insertion
    const snapshots = [mexcData, humbleData, tinymanData, pactfiData, uniswapData]
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