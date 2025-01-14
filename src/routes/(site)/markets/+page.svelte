<script lang="ts">
    import { Card, Tooltip, Button, Spinner } from 'flowbite-svelte';
    import type { PageData } from './$types';
    import { invalidateAll } from '$app/navigation';
    import PriceChart from '$lib/components/PriceChart.svelte';
  
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
    $: sortedMarketData = [...marketData].sort((a, b) => {
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
      return `$${formatNumber(num, 5)}`;
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
  
    $: ({ marketData, aggregates, circulatingSupply } = data);

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
        const response = await fetch(`/api/price-history?period=${period}${selectedTradingPairId ? `&trading_pair_id=${selectedTradingPairId}` : ''}`);
        priceHistory = await response.json();
    }

    let selectedTradingPairId: number | null = null;

    async function handleMarketClick(market: MarketData) {
        if (selectedTradingPairId === market.trading_pair_id) {
            selectedTradingPairId = null;
        } else {
            selectedTradingPairId = market.trading_pair_id;
        }
        const response = await fetch(`/api/price-history?trading_pair_id=${selectedTradingPairId}&period=${selectedPeriod}`);
        priceHistory = await response.json();
    }
  </script>
  
  <div class="bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-purple-900 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <!-- Header Section -->
      <header class="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-6 mb-8">
        <h1 class="text-3xl font-extrabold text-gray-900 dark:text-white">VOI Markets</h1>
        <p class="mt-2 text-xl text-gray-600 dark:text-gray-300">Track VOI token prices and market activity across exchanges</p>
      </header>
  
      <!-- Token Overview Section -->
      <div class="mb-8">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card class="bg-white dark:bg-gray-800">
            <div class="text-center">
              <div class="relative inline-block">
                <h3 class="text-lg font-semibold mb-2 text-gray-900 dark:text-white inline-flex items-center">
                  Volume-Weighted Price
                  <span class="ml-1 cursor-help">
                    <i class="fas fa-info-circle text-gray-400"></i>
                  </span>
                </h3>
                <Tooltip>Price weighted by 24h trading volume across all exchanges</Tooltip>
              </div>
              <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatPrice(weightedAveragePrice)}
              </p>
            </div>
          </Card>
          <Card class="bg-white dark:bg-gray-800">
            <div class="text-center">
              <div class="relative inline-block">
                <h3 class="text-lg font-semibold mb-2 text-gray-900 dark:text-white inline-flex items-center">
                  24h Volume
                  <span class="ml-1 cursor-help">
                    <i class="fas fa-info-circle text-gray-400"></i>
                  </span>
                </h3>
                <Tooltip>Combined 24h trading volume across all exchanges</Tooltip>
              </div>
              <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatCurrency(aggregates.totalVolume)}
              </p>
            </div>
          </Card>
          <Card class="bg-white dark:bg-gray-800">
            <div class="text-center">
              <div class="relative inline-block">
                <h3 class="text-lg font-semibold mb-2 text-gray-900 dark:text-white inline-flex items-center">
                  Market Cap
                  <span class="ml-1 cursor-help">
                    <i class="fas fa-info-circle text-gray-400"></i>
                  </span>
                </h3>
                <Tooltip>Market cap based on circulating supply of {Number(circulatingSupply.circulatingSupply).toLocaleString()} VOI</Tooltip>
              </div>
              <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatCurrency(circulatingMarketCap)}
              </p>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {circulatingSupply.percentDistributed}% Distributed
              </p>
            </div>
          </Card>
          <Card class="bg-white dark:bg-gray-800">
            <div class="text-center">
                <div class="relative inline-block">
                    <h3 class="text-lg font-semibold mb-2 text-gray-900 dark:text-white inline-flex items-center">
                        Fully Diluted Market Cap
                        <span class="ml-1 cursor-help">
                            <i class="fas fa-info-circle text-gray-400"></i>
                        </span>
                    </h3>
                    <Tooltip>Market cap if all 10B tokens were in circulation</Tooltip>
                </div>
                <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {formatCurrency(fullyDilutedMarketCap)}
                </p>
            </div>
          </Card>
        </div>
      </div>

      <!-- Price Chart Section -->
      <section class="bg-white dark:bg-gray-800 shadow-md rounded-xl overflow-hidden mb-8 p-2 sm:p-6">
          <PriceChart
              data={priceHistory}
              selectedPeriod={selectedPeriod}
              onPeriodChange={handlePeriodChange}
              selectedMarket={selectedTradingPairId ? marketData.find((m: MarketData) => m.trading_pair_id === selectedTradingPairId) : null}
          />
      </section>
  
      <!-- Markets Grid -->
      <section class="bg-white dark:bg-gray-800 shadow-md rounded-xl overflow-hidden">
        <header class="bg-purple-600 dark:bg-purple-800 py-4 px-6">
          <div class="flex justify-between items-center">
            <h2 class="text-2xl font-bold text-white">Market Overview</h2>
            <Button color="light" size="sm" class="flex items-center gap-2" disabled={isRefreshing} on:click={refreshData}>
              <i class="fas fa-sync-alt {isRefreshing ? 'animate-spin' : ''}"></i>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </header>
        <div class="p-4">
          <div class="overflow-x-auto">
            {#if isRefreshing}
              <div class="flex flex-col items-center justify-center py-12">
                <Spinner size="12" class="mb-4" />
                <p class="text-gray-600 dark:text-gray-400">Refreshing market data...</p>
              </div>
            {:else}
              <table class="w-full text-left">
                <thead class="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th class="px-4 py-3 text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('exchange')}>
                      Exchange {sortColumn === 'exchange' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('type')}>
                      Type {sortColumn === 'type' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('network')}>
                      Network {sortColumn === 'network' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('pair')}>
                      Pair {sortColumn === 'pair' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('price')}>
                      Price {sortColumn === 'price' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('price_change_percentage_24h')}>
                      24h Change {sortColumn === 'price_change_percentage_24h' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('volume_24h')}>
                      24h Volume {sortColumn === 'volume_24h' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('tvl')}>
                      TVL {sortColumn === 'tvl' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('lastUpdated')}>
                      Last Updated {sortColumn === 'lastUpdated' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th class="px-4 py-3 text-gray-900 dark:text-white">Pool</th>
                  </tr>
                </thead>
                <tbody>
                  {#each sortedMarketData as market}
                    <tr class="border-b dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer {selectedTradingPairId === market.trading_pair_id ? 'bg-purple-100 dark:bg-purple-800' : ''}" 
                        on:click={() => handleMarketClick(market)}>
                      <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {#if market.url}
                          <a href={market.url} target="_blank" rel="noopener noreferrer" class="hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                            {market.exchange}
                          </a>
                        {:else}
                          {market.exchange}
                        {/if}
                      </td>
                      <td class="px-4 py-3">
                        <span class="px-2 py-1 text-xs font-semibold rounded-full
                          {market.type === 'CEX' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' : 
                          'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'}">
                          {market.type}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-gray-700 dark:text-gray-300">{market.network}</td>
                      <td class="px-4 py-3 text-gray-700 dark:text-gray-300">{market.pair}</td>
                      <td class="px-4 py-3 text-gray-700 dark:text-gray-300">{formatPrice(market.price)}</td>
                      <td class="px-4 py-3">
                        <span class="font-medium {(market.price_change_percentage_24h ?? 0) > 0 ? 'text-green-600 dark:text-green-400' : (market.price_change_percentage_24h ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}">
                          {formatPercentage(market.price_change_percentage_24h)}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-gray-700 dark:text-gray-300">{formatCurrency(market.volume_24h)}</td>
                      <td class="px-4 py-3 text-gray-700 dark:text-gray-300">{market.tvl ? formatCurrency(market.tvl) : '-'}</td>
                      <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {market.lastUpdated.toLocaleString()}
                      </td>
                      <td class="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {#if market.pool_url}
                          <a href={market.pool_url}
                          aria-label="View pool on exchange"
                           target="_blank" rel="noopener noreferrer" class="text-gray-600 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-colors" on:click|stopPropagation>
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
  </div>
  
  <style>
    /* Add any custom styles here */
  </style> 