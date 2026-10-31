<script lang="ts">
	import {
		weightedAveragePrice as getWeightedAveragePrice, displayPrice as getDisplayPrice,
		circulatingMarketCap as getCirculatingMarketCap, tokenTotalSupplyAdjusted as getTokenTotalSupplyAdjusted,
		fullyDilutedMarketCap as getFullyDilutedMarketCap, sortMarkets, filterMarkets as getFilteredMarkets
	} from '$lib/markets/derive';
	import {
		createVoiUsdReference, fetchTokenChartData as loadTokenChartData,
		fetchVOIChartData as loadVOIChartData
	} from '$lib/markets/chartData';
	import { Alert } from 'flowbite-svelte';
	import { onMount } from 'svelte';
	import { createMarketDataLoader, type MarketDataState } from '$lib/markets/marketDataLoader';
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import PriceChart from '$lib/components/PriceChart.svelte';
	import MarketHeader from './MarketHeader.svelte';
	import KeyMetrics from './KeyMetrics.svelte';
	import MarketsPanel from './MarketsPanel.svelte';
	import ChartPanel from './ChartPanel.svelte';
	// Enhanced components (keep only used ones for now)
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import type { UniqueToken } from '../../api/tokens/+server';
	import type {
		TokenPair, OHLCVData, VolumeData, Resolution, ChartSettings
	} from '$lib/types/ohlcv.types';
	import {
		convertVoiQuotedCandlesToUsd, convertVoiQuotedVolumesToUsd, clampCandlesByMAD
	} from '$lib/utils/price-conversion';
	import {
		convertVOItoOHLCV, createVOITokenPair, shouldUseVOIData,
		getDefaultChartType, getDefaultResolution
	} from '$lib/utils/chart-adapters';

	export let data: PageData;
	let { marketData, aggregates, circulatingSupply, tokenPairs, tokenAnalytics, resolvedToken } = data;
	$: ({ marketData, aggregates, circulatingSupply, tokenPairs, tokenAnalytics, resolvedToken } =
		data);

	// Debug logs removed to reduce noise - page data reactive statement still exists but is silent

	// Use page data as primary source - don't let reactive statements override
	let realMarketData = Array.isArray(marketData) ? marketData : [];
	let fallbackPairs = Array.isArray(tokenPairs) ? tokenPairs : [];
	// TASK-107: null when the supply upstream failed; KeyMetrics renders it as "—".
	let realCirculatingSupply: { circulatingSupply: number; percentDistributed: number } | null =
		circulatingSupply ?? null;

	// Cache to prevent duplicate API requests
	const voiUsdReference = createVoiUsdReference((url) => fetch(url));
	const getVoiUsdReferenceData = voiUsdReference.get;
	let serverDataToken: string | null = null;

	// Initialize selectedToken from page load data
	let selectedToken: UniqueToken | null = null;

	// Initialize from resolved token data when available
	$: if (resolvedToken && !selectedToken && !_userClearedToken) {
		selectedToken = {
			id: resolvedToken.id || 0,
			symbol: resolvedToken.symbol || 'VOI',
			decimals: resolvedToken.symbol === 'VOI' ? 6 : 0, // Will be updated by fetchTokenInfo
			type: resolvedToken.symbol === 'VOI' ? 'VOI' : 'ARC200',
			poolCount: 0 // Will be updated by fetchTokenInfo
		};
		// Track that this token's data was loaded from the server
		serverDataToken = resolvedToken.symbol || 'VOI';
	}
	let selectedPool: TokenPair | null = null;
	let poolsLoading = false;

	// Token overview and analytics state. Seeded by +page.ts so hydration does not refetch it, but
	// never for VOI: VOI's overview runs without token info, and SSR must match (TASK-27 r1).
	let tokenInfo: any =
		data.resolvedToken?.id && data.resolvedToken.symbol !== 'VOI' ? (data.tokenInfo ?? null) : null;
	let tokenInfoLoading = false; // For VOI market data compatibility

	// Enhanced UI state
	let commandPaletteOpen = false;
	let commandPaletteShortcut = '';

	let allTokens: UniqueToken[] = [];

	// Simple search functionality
	let searchQuery = '';
	let filteredMarketData = realMarketData;

	// Track user-initiated token clearing to prevent URL re-initialization
	let _userClearedToken = false;

	onMount(() => {
		commandPaletteShortcut = /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl K';
		loadAllTokens();
	});

	async function loadAllTokens() {
		try {
			const response = await fetch('/api/tokens?limit=100');
			const data = await response.json();
			if (data.tokens) {
				allTokens = data.tokens;
			}
		} catch (error) {
			console.error('Failed to load tokens:', error);
		}
	}

	// Simple search function for markets
	function filterMarkets(query: string) {
		filteredMarketData = getFilteredMarkets(realMarketData, query);
	}

	// Fetch token info when token changes (but not for VOI)
	$: if (browser && selectedToken) {
		if (selectedToken.id === 0 || selectedToken.symbol === 'VOI') {
			// Clear token info for VOI
			tokenInfo = null;
		} else {
			fetchTokenInfo(selectedToken.id);
		}
	}

	// Fetch market data when token changes (including initialization)
	$: if (browser && selectedToken && selectedToken.id !== undefined) {
		console.log('Triggering market data fetch for tokenId:', selectedToken.id);
		fetchMarketDataForToken(selectedToken.id);
	}

	// Fetch token info when token changes
	async function fetchTokenInfo(tokenId: number) {
		// Skip if we already have token info from server data for the same token
		if (selectedToken?.symbol === serverDataToken && tokenInfo?.tokenId === tokenId) {
			console.log(
				'Skipping fetchTokenInfo - already have data from server for',
				selectedToken.symbol
			);
			return;
		}

		tokenInfoLoading = true;
		try {
			const response = await fetch(`/api/token-info?tokenId=${tokenId}`);
			const data = await response.json();
			if (data.info) {
				tokenInfo = data.info;
				console.log('Token info fetched:', {
					tokenId,
					symbol: data.info.symbol,
					totalSupply: data.info.totalSupply,
					decimals: data.info.decimals,
					imageUrl: data.info.imageUrl
				});
			} else {
				tokenInfo = null;
				console.log('No token info found for ID:', tokenId);
			}
		} catch (error) {
			console.error('Failed to fetch token info:', error);
			tokenInfo = null;
		} finally {
			tokenInfoLoading = false;
		}
	}

	// Use the real market data from server, filter by search query, and exclude zero TVL markets
	$: {
		let baseData = realMarketData.filter((market) => (market.tvl || 0) > 0); // Exclude zero TVL markets
		if (searchQuery.trim()) {
			const searchTerm = searchQuery.toLowerCase();
			filteredMarketData = baseData.filter(
				(market) =>
					market.pair.toLowerCase().includes(searchTerm) ||
					market.exchange.toLowerCase().includes(searchTerm) ||
					market.network.toLowerCase().includes(searchTerm)
			);
		} else {
			filteredMarketData = baseData;
		}
	}

	// Aggregate metrics with fallbacks when markets are empty
	let totalVolume24h: number | null;
	let totalTvlAll: number | null;
	let activeMarketsCount: number | null;
	$: totalVolume24h = (() => {
		if (realMarketData.length > 0) {
			const sum = realMarketData.reduce((s, m) => s + (m.volume_24h || 0), 0);
			const ana = tokenAnalytics?.volume?.volume24h ?? 0;

			// For VOI, use market data (includes cross-chain), for others prefer analytics
			if ((selectedToken?.symbol || 'VOI') === 'VOI') {
				console.log('VOI Volume calculation - using market data instead of inflated analytics:', {
					marketSum: sum,
					analyticsSum: ana,
					using: 'market data (correct)'
				});
				return sum; // Use market data, ignore inflated analytics
			} else {
				// For non-VOI tokens, use market sum (analytics data is inflated)
				console.log(
					'Non-VOI Volume calculation - using market data instead of inflated analytics:',
					{
						token: selectedToken?.symbol || 'VOI',
						marketSum: sum,
						analyticsSum: ana,
						using: 'market data (correct)'
					}
				);
				return sum; // Use market data, ignore inflated analytics
			}
		}
		return tokenAnalytics?.volume?.volume24h ?? null;
	})();

	$: totalTvlAll = (() => {
		if (realMarketData.length > 0) {
			const sum = realMarketData.reduce((s, m) => s + (m.tvl || 0), 0);
			const ana = tokenAnalytics?.tvl?.totalTvl ?? 0;

			// For VOI, use market data (includes cross-chain), for others prefer analytics
			if ((selectedToken?.symbol || 'VOI') === 'VOI') {
				console.log('VOI TVL calculation:', {
					marketSum: sum,
					analyticsSum: ana,
					using: sum > 0 ? 'market' : 'analytics'
				});
				return sum > 0 ? sum : ana;
			} else {
				// For non-VOI tokens, use market sum (analytics data is inflated)
				console.log('Non-VOI TVL calculation - using market data instead of inflated analytics:', {
					token: selectedToken?.symbol || 'VOI',
					marketSum: sum,
					analyticsSum: ana,
					using: 'market data (correct)'
				});
				return sum; // Use market data, ignore inflated analytics
			}
		}
		return tokenAnalytics?.tvl?.totalTvl ?? null;
	})();
	$: activeMarketsCount =
		realMarketData.length > 0
			? realMarketData.length
			: (fallbackPairs?.length ??
				(tokenAnalytics?.tvl?.poolCount === null ? null : (tokenAnalytics?.tvl?.poolCount ?? 0)));

	// Debug active markets count
	$: console.log('Active markets calculation:', {
		realMarketDataLength: realMarketData.length,
		fallbackPairsLength: fallbackPairs?.length,
		tokenAnalyticsPoolCount: tokenAnalytics?.tvl?.poolCount,
		activeMarketsCount
	});

	let fetchingMarketData = false;
	let marketDataError: string | null = null;
	let voiUsdStatus: MarketDataState['voiUsdStatus'] = data.voiUsdStatus ?? null;
	let voiUsdAsOf: string | null = data.voiUsdAsOf ?? null;
	const loader = createMarketDataLoader(
		(url) => fetch(url),
		(state) => {
			realMarketData = state.marketData;
			aggregates = state.aggregates;
			realCirculatingSupply = state.circulatingSupply;
			fetchingMarketData = state.loading;
			marketDataError = state.error;
			voiUsdStatus = state.voiUsdStatus;
			voiUsdAsOf = state.voiUsdAsOf;
		},
		{
			tokenId: data.resolvedToken?.id ?? 0,
			marketData: realMarketData,
			aggregates,
			circulatingSupply: realCirculatingSupply,
			voiUsdStatus,
			voiUsdAsOf,
			// A failed server load is not a settled result: the loader retries it after hydration
			error: data.error ? String(data.error) : null
		}
	);

	// Fetch market data for a specific token by ID
	async function fetchMarketDataForToken(tokenId: number, force = false) {
		// Never show the previous token's analytics under the new token (UX-01, TASK-21 r1)
		if (tokenAnalytics && tokenAnalytics.tokenId !== tokenId) tokenAnalytics = null;
		const applied = await loader.load(tokenId, { force });
		if (!applied || loader.state.tokenId !== tokenId || loader.state.error) return;

		// For non-VOI tokens, token analytics is fetched by +page.ts on initial load
		// Only fetch here if we don't have it (client-side token switch without page reload)
		if (tokenId !== 0) {
			if (!tokenAnalytics || tokenAnalytics.tokenId !== tokenId) {
				const requestId = loader.currentRequestId;
				try {
					const analyticsResponse = await fetch(`/api/token-analytics?tokenId=${tokenId}`);
					const analyticsData = await analyticsResponse.json();
					if (loader.isCurrent(requestId) && analyticsData.analytics) {
						tokenAnalytics = { ...analyticsData.analytics, partial: !!analyticsData.partial };
					}
				} catch (e) {
					console.warn('Failed to fetch token analytics:', e);
				}
			} else {
				console.log('Skipping token-analytics fetch - already have data for tokenId', tokenId);
			}
		} else {
			// Clear analytics for VOI
			tokenAnalytics = null;
		}
	}

	// Handle token selection
	function handleTokenSelect(event: CustomEvent<UniqueToken>) {
		selectedToken = event.detail;
		// Reset server data tracking and cache when user manually selects a token
		serverDataToken = null;
		// Clear cache when switching tokens to ensure fresh data
		voiUsdReference.reset();
		selectedPool = null; // Reset pool selection when token changes

		// If switching to VOI, do exactly what the Reset button was doing
		if (selectedToken.symbol.toUpperCase() === 'VOI') {
			_userClearedToken = true; // Prevent URL re-initialization
			selectedToken = {
				id: 0,
				symbol: 'VOI',
				decimals: 6,
				type: 'VOI',
				poolCount: 0
			};
			selectedPool = null;

			if (browser) {
				// Market data will be fetched by reactive statement
				// Just fetch chart data here
				fetchUnifiedChartData('VOI', chartSettings.resolution);

				// Update URL with token ID (0 for VOI) without triggering page load
				const url = new URL($page.url);
				url.searchParams.set('token', '0');
				url.searchParams.delete('pool');
				history.replaceState(history.state, '', url.toString());
			}
		} else {
			// Reset clear flag when selecting non-VOI tokens
			_userClearedToken = false;

			if (browser) {
				// Chart data will be fetched by reactive statement automatically
				// Update URL with token ID to avoid symbol lookup on page reload
				const url = new URL($page.url);
				url.searchParams.set('token', String(selectedToken.id));
				url.searchParams.delete('pool');
				// Use replaceState to update URL without triggering page load
				history.replaceState(history.state, '', url.toString());
			}
		}
	}

	// Handle pool selection
	function handlePoolSelect(event: CustomEvent<TokenPair | null>) {
		selectedPool = event.detail;

		// Fetch chart data for the selected pool, or default VOI data if null
		if (selectedPool) {
			fetchUnifiedChartData(selectedToken?.symbol || 'VOI', chartSettings.resolution);
			// Update pool in URL
			if (browser) {
				const url = new URL($page.url);
				url.searchParams.set('pool', String(selectedPool.poolId));
				if (selectedToken) url.searchParams.set('token', selectedToken.symbol);
				goto(url.toString(), {
					keepFocus: true,
					noScroll: true,
					replaceState: true,
					invalidateAll: false
				});
			}
		} else if (selectedToken?.symbol.toUpperCase() === 'VOI') {
			// Clear pool selection for VOI - show aggregated data
			fetchUnifiedChartData('VOI', chartSettings.resolution);
			if (browser) {
				const url = new URL($page.url);
				url.searchParams.delete('pool');
				goto(url.toString(), {
					keepFocus: true,
					noScroll: true,
					replaceState: true,
					invalidateAll: false
				});
			}
		}
	}

	// Sorting state - default to TVL descending (largest first)
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

	// Reactive sorted data - sort filtered data by TVL descending
	$: sortedMarketData = sortMarkets(filteredMarketData, sortColumn, sortDirection);

	// Calculate volume-weighted average price
	$: weightedAveragePrice = getWeightedAveragePrice(realMarketData, selectedToken);

	// Fallback display price from priceHistory when markets have no price
	$: displayPrice = getDisplayPrice(weightedAveragePrice, aggregates, priceHistory);

	// Calculate market caps
	// VOI: use circulating supply from server; Others: use totalSupply from tokenInfo (FDV)
	$: circulatingMarketCap = getCirculatingMarketCap(selectedToken, weightedAveragePrice, realCirculatingSupply);
	$: tokenTotalSupplyAdjusted = getTokenTotalSupplyAdjusted(tokenInfo);
	$: fullyDilutedMarketCap = getFullyDilutedMarketCap(tokenTotalSupplyAdjusted, weightedAveragePrice, selectedToken);

	let isRefreshing = false;
	async function refreshData() {
		if (!browser) return;
		isRefreshing = true;
		try {
			// Refresh market data for the currently selected token
			const tokenIdToFetch = selectedToken?.id ?? 0;
			await fetchMarketDataForToken(tokenIdToFetch, true);
			// Skip invalidateAll to prevent full page reload - we already fetched what we need
			// await invalidateAll();
		} finally {
			isRefreshing = false;
		}
	}

	let selectedPeriod: '24h' | '7d' = '24h';
	let priceHistory = data.priceHistory;

	async function handlePeriodChange(period: '24h' | '7d') {
		selectedPeriod = period;
		const response = await fetch(
			`/api/price-history?period=${period}${selectedTradingPairId ? `&trading_pair_id=${selectedTradingPairId}` : ''}&token=${selectedToken?.symbol || 'VOI'}`
		);
		priceHistory = await response.json();
	}

	let selectedTradingPairId: number | null = null;
	let selectedMarket: { exchange: string; pair: string; trading_pair_id: number } | null = null;

	// Click market row: load pool chart normalized to USD when possible
	async function handleMarketRowClick(market: any) {
		selectedTradingPairId = market.trading_pair_id;
		selectedMarket = {
			exchange: market.exchange,
			pair: market.pair,
			trading_pair_id: market.trading_pair_id
		};

		// Prefer OHLCV so we can normalize to USD when quote is VOI
		const baseId = market.base_token_id;
		const quoteId = market.quote_token_id;
		try {
			const res = await fetch(
				`/api/ohlcv?baseTokenId=${baseId}&quoteTokenId=${quoteId}&resolution=${chartSettings.resolution}&limit=500`
			);
			if (!res.ok) throw new Error(`Failed to load market OHLCV (${res.status})`);
			const json = await res.json();
			let candles = json?.candles || [];
			const quoteSym = (market.pair.split('/')[1] || '').toUpperCase();
			// If quote is VOI or WVOI, convert to USD using VOI reference series (with caching)
			if (candles.length && (quoteSym === 'VOI' || quoteSym === 'WVOI')) {
				try {
					const refJson = await getVoiUsdReferenceData();
					if (refJson) {
						candles = convertVoiQuotedCandlesToUsd(candles, refJson);
					}
				} catch (e) {
					console.warn('USD normalization failed; showing VOI quote');
				}
			}
			// Map to line data for PriceChart
			priceHistory = (candles || []).map((c: any) => ({ time: c.time, value: c.close }));
		} catch (e) {
			console.warn('Failed to load market OHLCV:', e);
		}
	}

	// Unified Chart State (using selectedPool instead of selectedTokenPair)
	let unifiedChartData: OHLCVData[] = [];
	let unifiedVolumeData: VolumeData[] = [];
	let chartTokenPair: TokenPair | null = null;
	let chartLoading = false;
	let chartError = '';
	let chartSettings: ChartSettings = {
		chartType: 'line',
		resolution: '1h',
		showVolume: false,
		theme: 'light'
	};
	let displayInUSD = true;

	// Chart display state
	let showTokenChart = false;
	let tokenChartData: OHLCVData[] = [];
	let tokenChartVolumes: VolumeData[] = [];
	let tokenChartLoading = false;
	let tokenChartError = '';
	let currentQuoteCurrency: 'VOI' | 'USD' = 'USD';

	// Initialize chart settings when token symbol actually changes
	let chartSettingsInitToken: string | null = null;
	$: if (selectedToken?.symbol && selectedToken.symbol !== chartSettingsInitToken) {
		chartSettings = {
			...chartSettings,
			chartType: getDefaultChartType(selectedToken.symbol),
			resolution: getDefaultResolution(selectedToken.symbol)
		};
		chartSettingsInitToken = selectedToken.symbol;
	}

	// Fetch chart data for selected token paired with VOI or USD
	async function fetchTokenChartData(
		tokenId: number,
		resolution: Resolution = '1h',
		quoteCurrency: 'VOI' | 'USD' = 'USD'
	) {
		if (!tokenId || tokenId === 0) return; // Skip for native VOI

		tokenChartLoading = true;
		tokenChartError = '';

		try {
			const result = await loadTokenChartData(
				fetch,
				getVoiUsdReferenceData,
				tokenId,
				resolution,
				quoteCurrency
			);
			if (!result) return;
			if (result.data) {
				tokenChartData = result.data;
				tokenChartVolumes = result.volumes;
				showTokenChart = true;
			} else {
				tokenChartError = result.error;
				showTokenChart = false;
			}
		} finally {
			tokenChartLoading = false;
		}
	}

	// Fetch OHLCV chart data for VOI (using VOI/aUSDC pool from MIMIR)
	async function fetchVOIChartData(
		resolution: Resolution = '1h',
		quoteCurrency: 'VOI' | 'USD' = 'USD'
	) {
		tokenChartLoading = true;
		tokenChartError = '';

		try {
			const result = await loadVOIChartData(fetch, resolution, quoteCurrency);
			if (result.data) {
				tokenChartData = result.data;
				tokenChartVolumes = result.volumes;
				showTokenChart = true;
			} else {
				tokenChartError = result.error;
				showTokenChart = false;
			}
		} finally {
			tokenChartLoading = false;
		}
	}

	// Watch for token selection changes and fetch chart data
	$: if (browser && selectedToken && selectedToken.id !== 0) {
		fetchTokenChartData(selectedToken.id, chartSettings.resolution, currentQuoteCurrency);
	} else if (browser && selectedToken && selectedToken.id === 0) {
		// For VOI, fetch OHLCV from VOI/aUSDC pool
		fetchVOIChartData(chartSettings.resolution, currentQuoteCurrency);
	}

	// Handle chart resolution changes
	async function handleChartResolutionChange(resolution: Resolution) {
		chartSettings = { ...chartSettings, resolution };
		if (selectedToken) {
			if (selectedToken.id === 0) {
				await fetchVOIChartData(resolution, currentQuoteCurrency);
			} else {
				await fetchTokenChartData(selectedToken.id, resolution, currentQuoteCurrency);
			}
		}
	}

	// Handle chart type changes
	function handleChartTypeChange(chartType: 'candlestick' | 'line') {
		chartSettings = { ...chartSettings, chartType };
	}

	// Unified Chart Functions
	let fetchSeq = 0;
	async function fetchUnifiedChartData(
		token: string,
		resolution: Resolution,
		tradingPairId?: number
	) {
		chartLoading = true;
		chartError = '';
		const seq = ++fetchSeq;

		try {
			// If a specific token pair or pool is selected, always fetch OHLCV from MIMIR
			if (selectedPool) {
				const pair = selectedPool;
				let localChartPair: TokenPair | null = null;
				let localCandles: OHLCVData[] = [];
				let localVolumes: VolumeData[] = [];
				async function fetchCandles(baseId: number, quoteId: number) {
					const params = new URLSearchParams({
						baseTokenId: baseId.toString(),
						quoteTokenId: quoteId.toString(),
						resolution,
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
					const period = resolution === '1d' || resolution === '4h' ? '7d' : '24h';
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
			} else if (token === 'VOI' || token.toUpperCase() === 'VOI') {
				// Fetch VOI OHLCV data from VOI/aUSDC pool in MIMIR
				const voiPair = createVOITokenPair();
				const params = new URLSearchParams({
					baseTokenId: voiPair.baseTokenId.toString(),
					quoteTokenId: voiPair.quoteTokenId.toString(),
					resolution,
					limit: '500'
				});

				const response = await fetch(`/api/ohlcv?${params}`);
				const data = await response.json();

				let localCandles: OHLCVData[] = [];
				let localVolumes: VolumeData[] = [];
				let localChartPair = { ...voiPair };

				if (data.error) {
					throw new Error(data.error);
				}

				if (data.candles && data.candles.length > 0) {
					localCandles = data.candles;
					localVolumes = data.volumes || [];

					// Convert to USD display if needed (aUSDC ≈ USD)
					if (displayInUSD) {
						localChartPair = { ...localChartPair, quoteSymbol: 'USD', quoteDecimals: 2 };
					}
				} else {
					// Fallback: try to get price-history data if no OHLCV available
					const period = resolution === '1d' || resolution === '4h' ? '7d' : '24h';
					const fallbackResponse = await fetch(
						`/api/price-history?period=${period}${tradingPairId ? `&trading_pair_id=${tradingPairId}` : ''}&token=${token}`
					);
					const voiPriceHistory = await fallbackResponse.json();

					if (voiPriceHistory.error) {
						throw new Error(voiPriceHistory.error);
					}

					if (Array.isArray(voiPriceHistory) && voiPriceHistory.length > 0) {
						localCandles = voiPriceHistory.map((point: any) => {
							const t = point.time;
							const time =
								typeof t === 'number'
									? t
									: typeof t === 'string' && /^\d+$/.test(t)
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
						localVolumes = [];
						// Update pair to reflect USD source
						localChartPair = { ...voiPair, quoteSymbol: 'USD', quoteDecimals: 2 };
					}
				}

				if (seq === fetchSeq) {
					unifiedChartData = localCandles;
					unifiedVolumeData = localVolumes;
					chartTokenPair = localChartPair;
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
	$: if (browser && (selectedToken?.symbol || 'VOI') !== prevToken) {
		prevToken = selectedToken?.symbol || 'VOI';
		if ((selectedToken?.symbol || 'VOI') === 'VOI' && !selectedPool) {
			fetchUnifiedChartData('VOI', chartSettings.resolution);
		}
	}

	// Token pair selection now handled via handlePoolSelect

	// A plain refetch: candles are rebuilt server-side every 5 minutes (TASK-17).
	function handleUnifiedRefresh(
		event: CustomEvent<{ tokenPair: TokenPair; resolution: Resolution }>
	) {
		const { resolution } = event.detail;
		if (shouldUseVOIData(selectedToken?.symbol || 'VOI')) {
			fetchUnifiedChartData(selectedToken?.symbol || 'VOI', resolution, selectedTradingPairId);
		} else {
			fetchUnifiedChartData(selectedToken?.symbol || 'VOI', resolution);
		}
	}

	function handleUnifiedResolutionChange(event: CustomEvent<Resolution>) {
		chartSettings = { ...chartSettings, resolution: event.detail };
		const tokenSymbol = selectedToken?.symbol || 'VOI';
		if (shouldUseVOIData(tokenSymbol)) {
			fetchUnifiedChartData(tokenSymbol, event.detail, selectedTradingPairId);
		} else if (selectedPool) {
			fetchUnifiedChartData(tokenSymbol, event.detail);
		}
	}

	function handleUnifiedChartTypeChange(event: CustomEvent<'candlestick' | 'line'>) {
		chartSettings = { ...chartSettings, chartType: event.detail };
	}

	// React to USD/VOI toggle by refetching chart with current resolution
	$: if (browser) {
		// Trigger refetch when displayInUSD changes and we have a pool or VOI context
		displayInUSD; // dependency for reactive statement
		if (selectedPool) {
			fetchUnifiedChartData(selectedToken?.symbol || 'VOI', chartSettings.resolution);
		} else if (
			shouldUseVOIData(selectedToken?.symbol || 'VOI') &&
			(selectedToken?.symbol || 'VOI') === 'VOI'
		) {
			// VOI aggregated data remains in USD; no special handling needed
		}
	}
</script>
<!-- Modern Token Analytics Interface -->
<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Beta Disclaimer Banner -->
	<div class="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
			<Alert color="yellow" class="!bg-transparent !border-0 !p-0">
				<div class="flex items-center gap-3">
					<i class="fas fa-exclamation-triangle text-amber-600 dark:text-amber-400 text-lg"></i>
					<div>
						<span class="font-semibold text-amber-800 dark:text-amber-300">Beta Feature:</span>
						<span class="text-amber-700 dark:text-amber-400">
							Markets data is currently in beta and under active development. All information should
							be verified independently before making any trading decisions.
						</span>
					</div>
				</div>
			</Alert>
		</div>
	</div>
	<div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
			<MarketHeader
				{selectedToken} {tokenInfo} {data} {realMarketData} {fetchingMarketData} {displayPrice}
				{commandPaletteShortcut} {allTokens} {handleTokenSelect} {refreshData} {isRefreshing} onSearch={() => (commandPaletteOpen = true)}
			/>

			<KeyMetrics
				{selectedToken} {fetchingMarketData} {totalVolume24h} {totalTvlAll} {circulatingMarketCap}
				{tokenTotalSupplyAdjusted} {fullyDilutedMarketCap} {realCirculatingSupply} {activeMarketsCount} {realMarketData}
			/>

			<!-- Chart + Markets side-by-side -->
			<section class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
				<ChartPanel
					{showTokenChart} {selectedToken} {tokenChartLoading} {tokenChartError} {tokenChartData}
					{tokenChartVolumes} bind:currentQuoteCurrency {chartSettings}
					{handleChartResolutionChange} {handleChartTypeChange} {fetchVOIChartData} {fetchTokenChartData} on:refreshData
				>
					<PriceChart data={priceHistory} {selectedPeriod} onPeriodChange={handlePeriodChange} {selectedMarket} />
				</ChartPanel>
				<MarketsPanel
					{voiUsdStatus} {voiUsdAsOf} {tokenAnalytics} {sortedMarketData} {searchQuery} onSearchQueryChange={(query) => (searchQuery = query)}
					{filterMarkets} {sortColumn} {sortDirection} {sortData} {selectedTradingPairId} onRowClick={handleMarketRowClick}
					{marketDataError} {refreshData} {isRefreshing}
				/>
			</section>
		</div>
	</div>
</div>
<CommandPalette
	bind:open={commandPaletteOpen}
	onselect={(token) => handleTokenSelect(new CustomEvent('tokenSelect', { detail: token }))}
/>
<style>
	/* Smooth transitions for view mode switches */
	section {
		transition: all 0.3s ease-in-out;
	}
	/* Enhanced mobile responsiveness */
	@media (max-width: 768px) {
		.max-w-7xl {
			padding-left: 1rem;
			padding-right: 1rem;
		}
	}
</style>
