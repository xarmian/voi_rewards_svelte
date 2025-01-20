<script lang="ts">
    import { Card, Tooltip, Button, Spinner } from 'flowbite-svelte';
    import type { PageData } from './$types';
    import { invalidateAll } from '$app/navigation';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import PriceChart from '$lib/components/PriceChart.svelte';
    import { TOKENS } from '$lib/utils/tokens';
  
    interface MarketData {
        price: number | null;
        volume_24h: number | null;
        tvl: number | null;
        price_change_percentage_24h: number | null;
        exchange: string;
        pair: string;
        type: string;
        network: string;
        url: string | null;
        pool_url: string | null;
        lastUpdated: Date;
        trading_pair_id: number;
    }
  
    export let data: PageData;
    $: ({ marketData, aggregates, circulatingSupply } = data);
  
    // Filter state
    let selectedToken: string;
    
    // Initialize selectedToken from URL or default to VOI
    $: {
        if (browser) {
            const urlParams = new URLSearchParams(window.location.search);
            selectedToken = urlParams.get('token') || 'VOI';
        } else {
            selectedToken = 'VOI';
        }
    }
    
    // Remove the client-side filtering since we're now doing it server-side
    $: filteredMarketData = marketData;
    
    // Handle token changes
    async function handleTokenChange(newToken: string) {
        if (!browser) return;
        await goto(`?token=${newToken}`, { keepFocus: true });
        await refreshData();
    }

    // Sorting state
    let sortColumn = 'tvl';
    let sortDirection: 'asc' | 'desc' = 'desc';
  
    // Sorting function
    const sortData = (column: string) => {
        if (sortColumn === column) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortColumn = column;
            sortDirection = 'desc';
        }
    };
  
    // Reactive sorted data
    $: sortedMarketData = [...filteredMarketData].sort((a, b) => {
        const aValue = a[sortColumn as keyof typeof a];
        const bValue = b[sortColumn as keyof typeof b];
        
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        
        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return sortDirection === 'asc' ? comparison : -comparison;
    });
  
    // Format number with commas and specified decimal places
    const formatNumber = (num: number | null | undefined, decimals: number = 2): string => {
      if (num === null || num === undefined || num === 0) return '-';
      return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    };
  
    // Format currency with $ symbol and 4 decimal places
    const formatPrice = (num: number | null | undefined): string => {
      if (num === null || num === undefined || num === 0) return '-';
      return `$${formatNumber(num, 6)}`;
    };
  
    // Format currency with $ symbol and 2 decimal places (for volume/TVL)
    const formatCurrency = (num: number | null | undefined): string => {
      if (num === null || num === undefined || num === 0) return '-';
      return `$${formatNumber(num, 2)}`;
    };
  
    // Format percentage
    const formatPercentage = (num: number | null | undefined): string => {
      if (num === null || num === undefined || num === 0) return '-';
      const formatted = formatNumber(num, 2);
      if (formatted === '-') return '-';
      return num > 0 ? `+${formatted}%` : `${formatted}%`;
    };
  
    // Calculate volume-weighted average price
    $: weightedAveragePrice = (() => {
        const marketsWithPriceAndVolume = (marketData as MarketData[]).filter(m => 
            m.price != null && m.price > 0 && 
            m.volume_24h != null && m.volume_24h > 0
        );
        
        if (marketsWithPriceAndVolume.length === 0) return 0;

        const totalWeightedPrice = marketsWithPriceAndVolume.reduce(
            (sum: number, market: MarketData) => sum + (market.price! * market.volume_24h!), 
            0
        );
        
        const totalVolume = marketsWithPriceAndVolume.reduce(
            (sum: number, market: MarketData) => sum + market.volume_24h!, 
            0
        );

        const price = totalVolume > 0 ? totalWeightedPrice / totalVolume : 0;
        return price;
    })();

    // Calculate market caps
    $: circulatingMarketCap = weightedAveragePrice * Number(circulatingSupply.circulatingSupply);
    $: fullyDilutedMarketCap = weightedAveragePrice * 10_000_000_000;

    let isRefreshing = false;

    async function refreshData() {
        if (!browser) return;
        isRefreshing = true;
        try {
            await invalidateAll();
        } finally {
            isRefreshing = false;
        }
    }

    let selectedPeriod: '24h' | '7d' = '24h';
    let priceHistory = data.priceHistory;

    async function handlePeriodChange(period: '24h' | '7d') {
        selectedPeriod = period;
        const response = await fetch(`/api/price-history?period=${period}${selectedTradingPairId ? `&trading_pair_id=${selectedTradingPairId}` : ''}&token=${selectedToken}`);
        priceHistory = await response.json();
    }

    let selectedTradingPairId: number | null = null;

    async function handleMarketClick(market: MarketData) {
        if (selectedTradingPairId === market.trading_pair_id) {
            selectedTradingPairId = null;
        } else {
            selectedTradingPairId = market.trading_pair_id;
        }
        const response = await fetch(`/api/price-history?trading_pair_id=${selectedTradingPairId}&period=${selectedPeriod}&token=${selectedToken}`);
        priceHistory = await response.json();
    }
  </script>
  
    <div class="max-w-7xl mx-auto relative">
      <!-- Header Section -->
      <header class="bg-white/95 dark:bg-black border border-[#00ff00] shadow-neon rounded-2xl p-6 mb-8 backdrop-blur-sm">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 class="text-3xl font-extrabold text-[#008000] dark:text-[#00ff00] glow-text uppercase tracking-wider">VOI Markets 🚀</h1>
            <p class="mt-2 text-xl text-[#800080] dark:text-[#ff00ff] glow-text-pink">Track VOI token prices and market activity across exchanges 💎</p>
          </div>
          
          <div class="mt-4 md:mt-0 flex items-center gap-4">
            <label for="token" class="text-[#008000] dark:text-[#00ff00]">Token:</label>
            <select
              id="token"
              bind:value={selectedToken}
              on:change={() => handleTokenChange(selectedToken)}
              class="bg-white/80 dark:bg-black border border-[#00ff00] text-[#008000] dark:text-[#00ff00] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00ff00] focus:outline-none shadow-neon backdrop-blur-sm"
            >
              {#each Object.values(TOKENS) as token}
                <option value={token.symbol}>{token.symbol}</option>
              {/each}
            </select>
          </div>
        </div>
      </header>
  
      <!-- Token Overview Section -->
      <div class="mb-8">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card class="bg-white/95 dark:bg-black border border-[#00ff00] shadow-neon transform hover:scale-105 transition-all duration-200 backdrop-blur-sm">
            <div class="text-center">
              <div class="relative inline-block">
                <h3 class="text-lg font-semibold mb-2 text-[#008000] dark:text-[#00ff00] glow-text inline-flex items-center">
                  Volume-Weighted Price
                  <span class="ml-1 cursor-help">
                    <i class="fas fa-info-circle text-[#008000]/70 dark:text-[#00ff00]/70"></i>
                  </span>
                </h3>
                <Tooltip>Price weighted by 24h trading volume across all exchanges</Tooltip>
              </div>
              <p class="text-2xl font-bold text-[#008000] dark:text-[#00ff00] glow-text">
                {formatPrice(weightedAveragePrice)}
              </p>
              <p class="text-sm text-[#008000]/70 dark:text-[#00ff00]/70">
                {Math.round(1 / weightedAveragePrice)} {selectedToken} = 1 USD
              </p>
            </div>
          </Card>

          <Card class="bg-white/95 dark:bg-black border border-[#ff00ff] shadow-neon-pink transform hover:scale-105 transition-all duration-200 backdrop-blur-sm">
            <div class="text-center">
              <div class="relative inline-block">
                <h3 class="text-lg font-semibold mb-2 text-[#800080] dark:text-[#ff00ff] glow-text-pink inline-flex items-center">
                  24h Volume
                  <span class="ml-1 cursor-help">
                    <i class="fas fa-info-circle text-[#800080]/70 dark:text-[#ff00ff]/70"></i>
                  </span>
                </h3>
                <Tooltip>Combined 24h trading volume across all exchanges</Tooltip>
              </div>
              <p class="text-2xl font-bold text-[#800080] dark:text-[#ff00ff] glow-text-pink">
                {formatCurrency(aggregates.totalVolume)}
              </p>
            </div>
          </Card>

          <Card class="bg-white/95 dark:bg-black border border-[#00ffff] shadow-neon-cyan transform hover:scale-105 transition-all duration-200 backdrop-blur-sm">
            <div class="text-center">
              <div class="relative inline-block">
                <h3 class="text-lg font-semibold mb-2 text-[#008080] dark:text-[#00ffff] glow-text-cyan inline-flex items-center">
                  Market Cap
                  <span class="ml-1 cursor-help">
                    <i class="fas fa-info-circle text-[#008080]/70 dark:text-[#00ffff]/70"></i>
                  </span>
                </h3>
                <Tooltip>Current market cap based on circulating supply</Tooltip>
              </div>
              <p class="text-2xl font-bold text-[#008080] dark:text-[#00ffff] glow-text-cyan">
                {formatCurrency(circulatingMarketCap)}
              </p>
              <p class="text-sm text-[#008080]/70 dark:text-[#00ffff]/70">
                {circulatingSupply.percentDistributed}% Distributed 🌍
              </p>
            </div>
          </Card>

          <Card class="bg-white/95 dark:bg-black border border-[#ff00ff] shadow-neon-pink transform hover:scale-105 transition-all duration-200 backdrop-blur-sm">
            <div class="text-center">
              <div class="relative inline-block">
                <h3 class="text-lg font-semibold mb-2 text-[#800080] dark:text-[#ff00ff] glow-text-pink inline-flex items-center">
                  Fully Diluted Market Cap
                  <span class="ml-1 cursor-help">
                    <i class="fas fa-info-circle text-[#800080]/70 dark:text-[#ff00ff]/70"></i>
                  </span>
                </h3>
                <Tooltip>Market cap if all 10B tokens were in circulation</Tooltip>
              </div>
              <p class="text-2xl font-bold text-[#800080] dark:text-[#ff00ff] glow-text-pink">
                {formatCurrency(fullyDilutedMarketCap)}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <!-- Price Chart Section -->
      <section class="bg-white/95 dark:bg-black border border-[#00ff00] shadow-neon rounded-xl overflow-hidden mb-8 p-2 sm:p-6 backdrop-blur-sm">
        <PriceChart
          data={priceHistory}
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
          selectedMarket={selectedTradingPairId ? marketData.find((m: MarketData) => m.trading_pair_id === selectedTradingPairId) : null}
        />
      </section>
  
      <!-- Markets Grid -->
      <section class="bg-white/95 dark:bg-black border border-[#00ff00] shadow-neon rounded-xl overflow-hidden backdrop-blur-sm">
        <header class="bg-[#00ff00]/20 dark:bg-[#00ff00]/20 py-4 px-6">
          <div class="flex justify-between items-center">
            <h2 class="text-2xl font-bold text-[#008000] dark:text-[#00ff00] glow-text">Market Overview 📊</h2>
            <Button color="light" size="sm" class="flex items-center gap-2 bg-white/95 dark:bg-black border border-[#00ff00] text-[#008000] dark:text-[#00ff00] hover:bg-[#00ff00]/10 dark:hover:bg-[#00ff00]/20" disabled={isRefreshing} on:click={refreshData}>
              <i class="fas fa-sync-alt {isRefreshing ? 'animate-spin' : ''}"></i>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </header>
        <div class="p-4">
          <div class="overflow-x-auto">
            {#if isRefreshing}
              <div class="flex flex-col items-center justify-center py-12">
                <Spinner size="12" class="mb-4 text-[#008000] dark:text-[#00ff00]" />
                <p class="text-[#008000] dark:text-[#00ff00]">Refreshing market data...</p>
              </div>
            {:else}
              <table class="w-full text-left">
                <thead class="bg-[#00ff00]/10 dark:bg-[#00ff00]/10">
                  <tr>
                    <th class="px-4 py-3 text-[#008000] dark:text-[#00ff00] cursor-pointer hover:bg-[#00ff00]/10 dark:hover:bg-[#00ff00]/20" on:click={() => sortData('exchange')}>
                      Exchange {sortColumn === 'exchange' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-[#008000] dark:text-[#00ff00] cursor-pointer hover:bg-[#00ff00]/10 dark:hover:bg-[#00ff00]/20" on:click={() => sortData('type')}>
                      Type {sortColumn === 'type' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-[#008000] dark:text-[#00ff00] cursor-pointer hover:bg-[#00ff00]/10 dark:hover:bg-[#00ff00]/20" on:click={() => sortData('network')}>
                      Network {sortColumn === 'network' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-[#008000] dark:text-[#00ff00] cursor-pointer hover:bg-[#00ff00]/10 dark:hover:bg-[#00ff00]/20" on:click={() => sortData('pair')}>
                      Pair {sortColumn === 'pair' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-[#008000] dark:text-[#00ff00] cursor-pointer hover:bg-[#00ff00]/10 dark:hover:bg-[#00ff00]/20" on:click={() => sortData('price')}>
                      Price {sortColumn === 'price' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-[#008000] dark:text-[#00ff00] cursor-pointer hover:bg-[#00ff00]/10 dark:hover:bg-[#00ff00]/20" on:click={() => sortData('price_change_percentage_24h')}>
                      24h Change {sortColumn === 'price_change_percentage_24h' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-[#008000] dark:text-[#00ff00] cursor-pointer hover:bg-[#00ff00]/10 dark:hover:bg-[#00ff00]/20" on:click={() => sortData('volume_24h')}>
                      24h Volume {sortColumn === 'volume_24h' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-[#008000] dark:text-[#00ff00] cursor-pointer hover:bg-[#00ff00]/10 dark:hover:bg-[#00ff00]/20" on:click={() => sortData('tvl')}>
                      TVL {sortColumn === 'tvl' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-[#008000] dark:text-[#00ff00] cursor-pointer hover:bg-[#00ff00]/10 dark:hover:bg-[#00ff00]/20" on:click={() => sortData('lastUpdated')}>
                      Last Updated {sortColumn === 'lastUpdated' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-[#008000] dark:text-[#00ff00]">Pool</th>
                  </tr>
                </thead>
                <tbody>
                  {#each sortedMarketData as market}
                    <tr class="border-b border-[#00ff00]/20 hover:bg-[#00ff00]/10 dark:hover:bg-[#00ff00]/10 cursor-pointer {selectedTradingPairId === market.trading_pair_id ? 'bg-[#00ff00]/20 dark:bg-[#00ff00]/20' : ''}" 
                        on:click={() => handleMarketClick(market)}>
                      <td class="px-4 py-3 font-medium text-[#008000] dark:text-[#00ff00]">
                        {#if market.url}
                          <a href={market.url} target="_blank" rel="noopener noreferrer" class="hover:text-[#800080] dark:hover:text-[#ff00ff] transition-colors">
                            {market.exchange}
                          </a>
                        {:else}
                          {market.exchange}
                        {/if}
                      </td>
                      <td class="px-4 py-3">
                        <span class="px-2 py-1 text-xs font-semibold rounded-full
                          {market.type === 'CEX' ? 'bg-[#00ffff]/10 dark:bg-[#00ffff]/20 text-[#008080] dark:text-[#00ffff] border border-[#00ffff]' : 
                          'bg-[#ff00ff]/10 dark:bg-[#ff00ff]/20 text-[#800080] dark:text-[#ff00ff] border border-[#ff00ff]'}">
                          {market.type}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-[#008000]/80 dark:text-[#00ff00]/80">{market.network}</td>
                      <td class="px-4 py-3 text-[#008000]/80 dark:text-[#00ff00]/80">{market.pair}</td>
                      <td class="px-4 py-3 text-[#008000]/80 dark:text-[#00ff00]/80">{formatPrice(market.price)}</td>
                      <td class="px-4 py-3">
                        <span class="font-medium {(market.price_change_percentage_24h ?? 0) > 0 ? 'text-[#008000] dark:text-[#00ff00] glow-text' : (market.price_change_percentage_24h ?? 0) < 0 ? 'text-[#800000] dark:text-[#ff0000] glow-text-red' : 'text-[#008000]/50 dark:text-[#00ff00]/50'}">
                          {formatPercentage(market.price_change_percentage_24h)}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-[#008000]/80 dark:text-[#00ff00]/80">{formatCurrency(market.volume_24h)}</td>
                      <td class="px-4 py-3 text-[#008000]/80 dark:text-[#00ff00]/80">{market.tvl ? formatCurrency(market.tvl) : '-'}</td>
                      <td class="px-4 py-3 text-sm text-[#008000]/80 dark:text-[#00ff00]/80">
                        {market.lastUpdated.toLocaleString()}
                      </td>
                      <td class="px-4 py-3 text-[#008000]/80 dark:text-[#00ff00]/80">
                        {#if market.pool_url}
                          <a href={market.pool_url}
                            aria-label="View pool on exchange"
                            target="_blank" rel="noopener noreferrer" 
                            class="text-[#008000] dark:text-[#00ff00] hover:text-[#800080] dark:hover:text-[#ff00ff] transition-colors" 
                            on:click|stopPropagation
                          >
                            <i class="fas fa-external-link-alt"></i>
                          </a>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        </div>
      </section>
    </div>
  
  <style>
    .glow-text {
      text-shadow: 0 0 10px #00ff00;
    }

    .glow-text-pink {
      text-shadow: 0 0 10px #ff00ff;
    }

    .glow-text-cyan {
      text-shadow: 0 0 10px #00ffff;
    }

    .glow-text-red {
      text-shadow: 0 0 10px #ff0000;
    }

    .shadow-neon {
      box-shadow: 0 0 15px #00ff00;
    }

    .shadow-neon-pink {
      box-shadow: 0 0 15px #ff00ff;
    }

    .shadow-neon-cyan {
      box-shadow: 0 0 15px #00ffff;
    }

    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }

    .animate-pulse {
      animation: pulse 2s infinite;
    }

    /* Dark mode adjustments */
    :global(.dark) .glow-text {
      text-shadow: 0 0 15px #00ff00;
    }

    :global(.dark) .glow-text-pink {
      text-shadow: 0 0 15px #ff00ff;
    }

    :global(.dark) .glow-text-cyan {
      text-shadow: 0 0 15px #00ffff;
    }

    :global(.dark) .glow-text-red {
      text-shadow: 0 0 15px #ff0000;
    }

    :global(.dark) .shadow-neon {
      box-shadow: 0 0 20px #00ff00;
    }

    :global(.dark) .shadow-neon-pink {
      box-shadow: 0 0 20px #ff00ff;
    }

    :global(.dark) .shadow-neon-cyan {
      box-shadow: 0 0 20px #00ffff;
    }
  </style> 