<script lang="ts">
    import { Card, Tooltip, Button, Spinner } from 'flowbite-svelte';
    import type { PageData } from './$types';
    import { invalidateAll } from '$app/navigation';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import OHLCVChart from '$lib/components/OHLCVChart.svelte';
    import TokenSelector from '$lib/components/TokenSelector.svelte';
    import PoolSelector from '$lib/components/PoolSelector.svelte';
    import TokenMetricsBar from '$lib/components/TokenMetricsBar.svelte';
    import { TOKENS } from '$lib/utils/tokens';
    import type { UniqueToken } from '../../api/tokens/+server';
    import type { TokenPair, OHLCVData, VolumeData, Resolution, ChartSettings } from '$lib/types/ohlcv.types';
    import { convertVoiQuotedCandlesToUsd, convertVoiQuotedVolumesToUsd, clampCandlesByMAD } from '$lib/utils/price-conversion';
    import { 
        convertVOItoOHLCV, 
        createVOITokenPair, 
        shouldUseVOIData, 
        getDefaultChartType,
        getDefaultResolution
    } from '$lib/utils/chart-adapters';
  
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
  
    // New token-based state
    let selectedToken: UniqueToken | null = null;
    let selectedPool: TokenPair | null = null;
    let poolsLoading = false;
    let legacySelectedToken: string = 'VOI'; // For VOI market data compatibility
    
    // Initialize selected token from URL (?token=ID) or default to VOI
    let _initTokenOnce = false;
    async function initSelectedTokenFromUrl() {
        try {
            const url = new URL(window.location.toString());
            const tokenParam = url.searchParams.get('token');
            const poolParam = url.searchParams.get('pool');

            // If numeric ID, resolve token details from token-pairs
            if (tokenParam && /^\d+$/.test(tokenParam)) {
                const res = await fetch(`/api/token-pairs?tokenId=${tokenParam}&limit=50`);
                const data = await res.json();
                const id = parseInt(tokenParam, 10);
                if (data?.pairs?.length) {
                    // Prefer a pair that explicitly includes our ID
                    const match = data.pairs.find((p: any) => p.baseTokenId === id || p.quoteTokenId === id) || data.pairs[0];
                    const isBase = match.baseTokenId === id;
                    const rawSymbol = isBase ? match.baseSymbol : match.quoteSymbol;
                    const decimals = isBase ? match.baseDecimals : match.quoteDecimals;
                    const normSymbol = (rawSymbol || '').toUpperCase() === 'WVOI' ? 'VOI' : (rawSymbol || 'VOI');
                    selectedToken = {
                        id,
                        symbol: normSymbol,
                        decimals: typeof decimals === 'number' ? decimals : 6,
                        type: (normSymbol.toUpperCase() === 'VOI') ? 'VOI' : 'UNKNOWN',
                        poolCount: 0
                    };
                    // If a pool is specified, try to preselect it for this token
                    if (poolParam && /^\d+$/.test(poolParam)) {
                        try {
                            const pairsRes = await fetch(`/api/token-pairs?tokenId=${id}&limit=200`);
                            const pairsJson = await pairsRes.json();
                            const pid = parseInt(poolParam, 10);
                            const found = (pairsJson?.pairs || []).find((p: any) => p.poolId === pid);
                            if (found) {
                                selectedPool = found;
                                selectedTokenPair = found;
                                legacySelectedToken = selectedToken.symbol;
                                fetchUnifiedChartData(legacySelectedToken, chartSettings.resolution);
                            }
                        } catch (e) {
                            console.warn('Failed to init pool from URL:', e);
                        }
                    }
                    return;
                }
            }
        } catch (e) {
            console.warn('Failed to init token from URL:', e);
        }
        // Fallback: VOI default
        selectedToken = {
            id: 0,
            symbol: 'VOI',
            decimals: 6,
            type: 'VOI',
            poolCount: 0
        };
    }

    $: if (browser && !_initTokenOnce && !selectedToken) {
        _initTokenOnce = true;
        initSelectedTokenFromUrl();
    }
    
    // Keep legacy token string for VOI market data compatibility
    $: if (selectedToken) {
        legacySelectedToken = selectedToken.symbol;
    }
    
    // Remove the client-side filtering since we're now doing it server-side
    $: filteredMarketData = marketData;
    
    // Handle token selection
    function handleTokenSelect(event: CustomEvent<UniqueToken>) {
        selectedToken = event.detail;
        selectedPool = null; // Reset pool selection when token changes
        
        // Update URL to reflect token selection (use token ID)
        if (browser) {
            const url = new URL(window.location.toString());
            url.searchParams.set('token', String(selectedToken.id));
            window.history.pushState({}, '', url);
        }
    }

    // Handle pool selection
    function handlePoolSelect(event: CustomEvent<TokenPair | null>) {
        selectedPool = event.detail;
        selectedTokenPair = event.detail; // Keep compatibility with existing chart logic
        
        // Fetch chart data for the selected pool, or default VOI data if null
        if (selectedPool) {
            fetchUnifiedChartData(selectedToken?.symbol || 'VOI', chartSettings.resolution);
            // Update pool in URL
            if (browser) {
                const url = new URL(window.location.toString());
                url.searchParams.set('pool', String(selectedPool.poolId));
                // Ensure token param is present
                if (selectedToken) url.searchParams.set('token', String(selectedToken.id));
                window.history.pushState({}, '', url);
            }
        } else if (selectedToken?.symbol.toUpperCase() === 'VOI') {
            // Clear pool selection for VOI - show aggregated data
            fetchUnifiedChartData('VOI', chartSettings.resolution);
            if (browser) {
                const url = new URL(window.location.toString());
                url.searchParams.delete('pool');
                window.history.pushState({}, '', url);
            }
        }
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
        const response = await fetch(`/api/price-history?period=${period}${selectedTradingPairId ? `&trading_pair_id=${selectedTradingPairId}` : ''}&token=${legacySelectedToken}`);
        priceHistory = await response.json();
    }

    let selectedTradingPairId: number | null = null;

    async function handleMarketClick(market: MarketData) {
        if (selectedTradingPairId === market.trading_pair_id) {
            selectedTradingPairId = null;
        } else {
            selectedTradingPairId = market.trading_pair_id;
        }
        const response = await fetch(`/api/price-history?trading_pair_id=${selectedTradingPairId}&period=${selectedPeriod}&token=${legacySelectedToken}`);
        priceHistory = await response.json();
    }

    // Unified Chart State
    let selectedTokenPair: TokenPair | null = null;
    let unifiedChartData: OHLCVData[] = [];
    let unifiedVolumeData: VolumeData[] = [];
    let chartTokenPair: TokenPair | null = null;
    let chartLoading = false;
    let chartError = '';
    let chartSettings: ChartSettings = {
        chartType: 'line',
        resolution: '1h',
        autoRefresh: false,
        refreshInterval: 5,
        showVolume: false,
        theme: 'light'
    };
    let displayInUSD = true;
    
    // Initialize chart settings based on selected token
    $: if (legacySelectedToken) {
        chartSettings.chartType = getDefaultChartType(legacySelectedToken);
        chartSettings.resolution = getDefaultResolution(legacySelectedToken);
    }

    // Unified Chart Functions
    let fetchSeq = 0;
    async function fetchUnifiedChartData(token: string, resolution: Resolution, refresh = false, tradingPairId?: number) {
        chartLoading = true;
        chartError = '';
        const seq = ++fetchSeq;

        try {
            // If a specific token pair or pool is selected, always fetch OHLCV from MIMIR
            if (selectedTokenPair || selectedPool) {
                const pair = selectedPool || selectedTokenPair;
                let localChartPair: TokenPair | null = null;
                let localCandles: OHLCVData[] = [];
                let localVolumes: VolumeData[] = [];
                async function fetchCandles(baseId: number, quoteId: number) {
                    const params = new URLSearchParams({
                        baseTokenId: baseId.toString(),
                        quoteTokenId: quoteId.toString(),
                        resolution,
                        refresh: refresh.toString(),
                        limit: '500'
                    });
                    const response = await fetch(`/api/ohlcv?${params}`);
                    return response.json();
                }

                // Try requested orientation; if empty, try swapped orientation
                let data = await fetchCandles(pair.baseTokenId, pair.quoteTokenId);
                let usedPair = { ...pair };
                if (!data.error && (!data.candles || data.candles.length === 0)) {
                    const swapped = await fetchCandles(pair.quoteTokenId, pair.baseTokenId);
                    if (!swapped.error && swapped.candles && swapped.candles.length > 0) {
                        data = swapped;
                        // Adjust usedPair to reflect the orientation of returned candles
                        usedPair = {
                            baseTokenId: pair.quoteTokenId,
                            quoteTokenId: pair.baseTokenId,
                            baseSymbol: pair.quoteSymbol,
                            quoteSymbol: pair.baseSymbol,
                            baseDecimals: pair.quoteDecimals,
                            quoteDecimals: pair.baseDecimals,
                            poolId: pair.poolId
                        };
                    }
                }

                if (data.error) {
                    throw new Error(data.error);
                }

                localCandles = data.candles || [];
                localVolumes = data.volumes || [];
                localChartPair = usedPair;

                // Clamp extreme outliers for aUSDC/VOI pool (visual sanity)
                const baseSym = (localChartPair.baseSymbol || '').toUpperCase();
                const quoteSym = (localChartPair.quoteSymbol || '').toUpperCase();
                const isVoiQuote = quoteSym === 'VOI' || quoteSym === 'WVOI';
                const isAusdcVoiPool = baseSym === 'AUSDC' && isVoiQuote;
                if (isAusdcVoiPool && localCandles.length > 0) {
                    localCandles = clampCandlesByMAD(localCandles, 6);
                }

                // Convert VOI-quoted prices to USD using VOI USD reference series
                if (displayInUSD && isVoiQuote && localCandles.length > 0) {
                    const period = (resolution === '1d' || resolution === '4h') ? '7d' : '24h';
                    try {
                        const refRes = await fetch(`/api/price-history?period=${period}&token=VOI`);
                        const refJson = await refRes.json();
                        if (Array.isArray(refJson) && refJson.length) {
                            localCandles = convertVoiQuotedCandlesToUsd(localCandles, refJson);
                            if (localVolumes?.length) {
                                localVolumes = convertVoiQuotedVolumesToUsd(localVolumes, refJson);
                            }
                            // Use a dedicated chart pair so UI/search state isn't mutated
                            localChartPair = { ...localChartPair, quoteSymbol: 'USD', quoteDecimals: 2 };
                        }
                    } catch (e) {
                        console.warn('USD conversion failed, showing VOI quote', e);
                    }
                }

                // Apply final results if latest
                if (seq === fetchSeq) {
                    unifiedChartData = localCandles;
                    unifiedVolumeData = localVolumes;
                    chartTokenPair = localChartPair;
                }
            } else if (shouldUseVOIData(token)) {
                // Use VOI data as simple line chart data - don't convert to OHLCV
                const period = resolution === '1h' ? '7d' : '24h';
                const response = await fetch(`/api/price-history?period=${period}${tradingPairId ? `&trading_pair_id=${tradingPairId}` : ''}&token=${token}`);
                const voiPriceHistory = await response.json();

                if (voiPriceHistory.error) {
                    throw new Error(voiPriceHistory.error);
                }

                const voiCandles = voiPriceHistory.map((point: any) => {
                    const t = point.time;
                    const time = typeof t === 'number'
                        ? t
                        : (typeof t === 'string' && /^\d+$/.test(t))
                            ? parseInt(t, 10)
                            : Math.floor(new Date(t).getTime() / 1000);
                    return {
                        time,
                        open: point.value,
                        high: point.value,
                        low: point.value,
                        close: point.value,
                        volume: 0
                    };
                });

                if (seq === fetchSeq) {
                    unifiedChartData = voiCandles;
                    unifiedVolumeData = [];
                    chartTokenPair = createVOITokenPair();
                }
            } else {
                throw new Error('No token pair selected');
            }

        } catch (error) {
            console.error('Error fetching chart data:', error);
            chartError = error instanceof Error ? error.message : 'Failed to load chart data';
            unifiedChartData = [];
            unifiedVolumeData = [];
        } finally {
            if (seq === fetchSeq) {
                chartLoading = false;
            }
        }
    }

    // Handle token changes once (avoid reacting on resolution changes)
    // Only auto-fetch when token is VOI and no pair is selected. Do not clear state for non-VOI.
    let prevToken: string | null = null;
    $: if (browser && legacySelectedToken !== prevToken) {
        prevToken = legacySelectedToken;
        if (legacySelectedToken === 'VOI' && !selectedTokenPair && !selectedPool) {
            fetchUnifiedChartData('VOI', chartSettings.resolution);
        }
    }

    async function handleTokenPairSelect(event: CustomEvent<TokenPair>) {
        selectedTokenPair = event.detail;
        // Switch context to the selected pair's base token (normalize wVOI -> VOI for display)
        const base = (event.detail.baseSymbol || '').toUpperCase();
        const newToken = base === 'WVOI' ? 'VOI' : event.detail.baseSymbol || legacySelectedToken;
        if (newToken !== legacySelectedToken) {
            legacySelectedToken = newToken;
        }
        // Fetch OHLCV data for selected pair
        fetchUnifiedChartData(legacySelectedToken, chartSettings.resolution);
    }

    function handleUnifiedRefresh(event: CustomEvent<{ tokenPair: TokenPair; resolution: Resolution }>) {
        const { resolution } = event.detail;
        if (shouldUseVOIData(legacySelectedToken)) {
            fetchUnifiedChartData(legacySelectedToken, resolution, true, selectedTradingPairId);
        } else {
            fetchUnifiedChartData(legacySelectedToken, resolution, true);
        }
    }

    function handleUnifiedResolutionChange(event: CustomEvent<Resolution>) {
        chartSettings.resolution = event.detail;
        if (shouldUseVOIData(legacySelectedToken)) {
            fetchUnifiedChartData(legacySelectedToken, event.detail, false, selectedTradingPairId);
        } else if (selectedTokenPair || selectedPool) {
            fetchUnifiedChartData(legacySelectedToken, event.detail);
        }
    }

    function handleUnifiedChartTypeChange(event: CustomEvent<'candlestick' | 'line'>) {
        chartSettings.chartType = event.detail;
    }

    // React to USD/VOI toggle by refetching chart with current resolution
    $: if (browser) {
        // Trigger refetch when displayInUSD changes and we have a pool or VOI context
        displayInUSD; // dependency for reactive statement
        if (selectedPool || selectedTokenPair) {
            fetchUnifiedChartData(legacySelectedToken, chartSettings.resolution);
        } else if (shouldUseVOIData(legacySelectedToken) && legacySelectedToken === 'VOI') {
            // VOI aggregated data remains in USD; no special handling needed
        }
    }
  </script>
  
  <div class="bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-purple-900 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <!-- Header Section -->
      <header class="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-6 mb-8">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 class="text-3xl font-extrabold text-gray-900 dark:text-white">
              {legacySelectedToken === 'VOI' ? 'VOI Markets' : `${legacySelectedToken} Trading Charts`}
            </h1>
            <p class="mt-2 text-xl text-gray-600 dark:text-gray-300">
              {legacySelectedToken === 'VOI' 
                ? 'Track VOI token prices and market activity across exchanges'
                : ``
              }
            </p>
          </div>
          
          <div class="mt-4 md:mt-0 flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
            <div class="flex flex-col sm:flex-row gap-3 flex-1">
              <div class="w-full sm:w-80">
                <TokenSelector
                  bind:selectedToken={selectedToken}
                  on:select={handleTokenSelect}
                />
              </div>
              {#if selectedToken}
                <div class="w-full sm:w-80">
                  <PoolSelector
                    {selectedToken}
                    bind:selectedPool={selectedPool}
                    on:select={handlePoolSelect}
                  />
                </div>
              {/if}
            </div>
            <!-- USD / VOI toggle -->
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600 dark:text-gray-300">Quote:</span>
              <div class="inline-flex rounded-md shadow-sm" role="group">
                <button type="button"
                  class={`px-3 py-1.5 text-sm font-medium border ${displayInUSD ? 'bg-purple-600 text-white border-purple-600' : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600'}`}
                  on:click={() => displayInUSD = true}
                  aria-pressed={displayInUSD}
                >USD</button>
                <button type="button"
                  class={`px-3 py-1.5 text-sm font-medium border -ml-px ${!displayInUSD ? 'bg-purple-600 text-white border-purple-600' : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600'}`}
                  on:click={() => displayInUSD = false}
                  aria-pressed={!displayInUSD}
                >VOI</button>
              </div>
            </div>
            <button
              type="button"
              class="text-sm text-purple-600 hover:text-purple-700 hover:underline dark:text-purple-400 dark:hover:text-purple-300 whitespace-nowrap"
              on:click={() => {
                selectedToken = {
                  id: 0,
                  symbol: 'VOI',
                  decimals: 6,
                  type: 'VOI',
                  poolCount: 0
                };
                selectedPool = null;
                selectedTokenPair = null;
                if (browser) {
                  fetchUnifiedChartData('VOI', chartSettings.resolution);
                  const url = new URL(window.location.toString());
                  url.searchParams.set('token', '0');
                  url.searchParams.delete('pool');
                  window.history.pushState({}, '', url);
                }
              }}
            >
              Reset to VOI
            </button>
          </div>
        </div>
      </header>

      <!-- Beta Disclaimer -->
      <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
        <div class="flex items-start gap-3">
          <div class="flex-shrink-0">
            <i class="fas fa-exclamation-triangle text-amber-600 dark:text-amber-400 mt-0.5"></i>
          </div>
          <div class="flex-1">
            <h4 class="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
              Beta Feature - Work in Progress
            </h4>
            <p class="text-sm text-amber-700 dark:text-amber-300">
              This markets page is currently in beta and under active development. Data may be incomplete or inaccurate. 
              Please verify information with secondary sources and use at your own discretion.
            </p>
          </div>
        </div>
      </div>
  
      <!-- Token Metrics Bar -->
      <div class="w-full">
        <TokenMetricsBar 
          {selectedToken}
          {selectedPool}
          {marketData}
          {aggregates}
          {circulatingSupply}
          {weightedAveragePrice}
          ohlcvData={unifiedChartData}
          {displayInUSD}
          quoteSymbol={chartTokenPair?.quoteSymbol || (shouldUseVOIData(legacySelectedToken) ? 'USD' : null)}
        />
      </div>

      <!-- Token Overview Section - VOI Only -->
      {#if shouldUseVOIData(legacySelectedToken) && false}
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
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {Math.round(1 / weightedAveragePrice)} {selectedToken} = 1 USD
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
                {Math.round(circulatingSupply.circulatingSupply / 10_000_000_000 * 10000) / 100}% Circulating
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
      {/if}

      <!-- Chart Section -->
      <section class="bg-white dark:bg-gray-800 shadow-md rounded-xl overflow-hidden mb-8 p-2 sm:p-6">
          {#if legacySelectedToken && (shouldUseVOIData(legacySelectedToken) || selectedTokenPair || selectedPool)}
            {#if chartError}
              <Card class="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                <div class="flex items-center gap-3 text-red-600 dark:text-red-400">
                  <i class="fas fa-exclamation-triangle"></i>
                  <div>
                    <h5 class="font-medium">Failed to load chart data</h5>
                    <p class="text-sm mt-1">{chartError}</p>
                  </div>
                </div>
              </Card>
            {:else}
              <OHLCVChart
                tokenPair={chartTokenPair || selectedPool || selectedTokenPair || createVOITokenPair()}
                data={unifiedChartData}
                volumes={unifiedVolumeData}
                loading={chartLoading}
                settings={chartSettings}
                on:refreshData={handleUnifiedRefresh}
                on:resolutionChange={handleUnifiedResolutionChange}
                on:chartTypeChange={handleUnifiedChartTypeChange}
              />
            {/if}
          {:else}
            <Card class="bg-gray-50 dark:bg-gray-700">
              <div class="text-center py-12">
                <i class="fas fa-search text-4xl text-gray-400 mb-4"></i>
                <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {shouldUseVOIData(legacySelectedToken) ? 'Loading Chart Data...' : 'Select a Token and Pool'}
                </h4>
                <p class="text-gray-600 dark:text-gray-400">
                  {shouldUseVOIData(legacySelectedToken) 
                    ? 'Chart data is loading for VOI markets'
                    : selectedToken
                      ? `Choose a pool from the list above to view charts for ${selectedToken.symbol}`
                      : 'Search for a token above to view its available trading pools and charts'
                  }
                </p>
              </div>
            </Card>
          {/if}
      </section>

  
      <!-- Markets Grid - VOI Only -->
      {#if shouldUseVOIData(legacySelectedToken)}
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
      {/if}
    </div>
  </div>
  
  <style>
    /* Add any custom styles here */
  </style> 
