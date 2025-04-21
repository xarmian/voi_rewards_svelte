<script lang="ts">
  import { onMount } from 'svelte';
  
  interface MarketData {
    aggregates: {
      weightedAveragePrice: number;
      totalVolume: number;
      totalTvl: number;
    };
    circulatingSupply: {
      circulatingSupply: number;
      percentDistributed: number;
    };
  }
  
  let marketData: MarketData | null = null;
  let isLoading = true;
  let error = false;
  
  onMount(async () => {
    try {
      const response = await fetch('/api/markets?token=VOI');
      if (!response.ok) throw new Error('Failed to fetch market data');
      marketData = await response.json();
    } catch (e) {
      console.error('Error fetching market data:', e);
      error = true;
    } finally {
      isLoading = false;
    }
  });
  
  // Calculate market cap
  $: marketCap = marketData 
    ? marketData.aggregates.weightedAveragePrice * marketData.circulatingSupply.circulatingSupply 
    : 0;
    
  // Format as USD with 2 decimal places
  const formatUSD = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(value);
  };
  
  // Format market cap with appropriate suffix (K, M, B)
  const formatMarketCap = (value: number) => {
    if (value >= 1_000_000_000) {
      return `${formatUSD(value / 1_000_000_000)}B`;
    } else if (value >= 1_000_000) {
      return `${formatUSD(value / 1_000_000)}M`;
    } else if (value >= 1_000) {
      return `${formatUSD(value / 1_000)}K`;
    } else {
      return formatUSD(value);
    }
  };
</script>

<div class="flex flex-col sm:flex-row items-center gap-3 justify-center w-full max-w-md">
  {#if isLoading}
    <div class="flex gap-3 items-center py-2 w-full justify-center">
      <div class="animate-pulse w-32 h-8 bg-white/20 rounded-xl"></div>
      <div class="animate-pulse w-32 h-8 bg-white/20 rounded-xl"></div>
    </div>
  {:else if error}
    <div class="text-sm text-red-300 bg-red-500/20 px-4 py-2 rounded-xl">Unable to load market data</div>
  {:else if marketData}
    <div class="flex gap-4 items-center justify-center w-full">
      <div class="flex-1 backdrop-blur-sm bg-white/10 px-4 py-2 rounded-xl border border-white/20 shadow-sm">
        <div class="text-xs uppercase tracking-wider text-purple-200 mb-1">Price</div>
        <div class="text-lg font-bold text-white">
          {formatUSD(marketData.aggregates.weightedAveragePrice)}
        </div>
      </div>
      
      <div class="flex-1 backdrop-blur-sm bg-white/10 px-4 py-2 rounded-xl border border-white/20 shadow-sm">
        <div class="text-xs uppercase tracking-wider text-purple-200 mb-1">Market Cap</div>
        <div class="text-lg font-bold text-white">
          {formatMarketCap(marketCap)}
        </div>
      </div>
    </div>
  {/if}
</div> 