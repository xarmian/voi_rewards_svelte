<script lang="ts">
	import { Card, Tooltip, Button, Spinner, Badge, Tabs, TabItem } from 'flowbite-svelte';
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import type { PageData } from './$types';
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import OHLCVChart from '$lib/components/OHLCVChart.svelte';
	import PriceChart from '$lib/components/PriceChart.svelte';
	import TokenSelector from '$lib/components/TokenSelector.svelte';
	import PoolSelector from '$lib/components/PoolSelector.svelte';
	import TokenMetricsBar from '$lib/components/TokenMetricsBar.svelte';
	import PoolDetails from '$lib/components/PoolDetails.svelte';
	// New enhanced components
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import TokenHeatmap from '$lib/components/TokenHeatmap.svelte';
	import TokenComparison from '$lib/components/TokenComparison.svelte';
	import TokenGalaxy from '$lib/components/TokenGalaxy.svelte';

	import WatchlistManager from '$lib/components/WatchlistManager.svelte';
	import MobileTokenCard from '$lib/components/MobileTokenCard.svelte';
	import MetricsRadar from '$lib/components/MetricsRadar.svelte';
	import { TOKENS } from '$lib/utils/tokens';
	import type { UniqueToken } from '../../api/tokens/+server';
	import type {
		TokenPair,
		OHLCVData,
		VolumeData,
		Resolution,
		ChartSettings
	} from '$lib/types/ohlcv.types';
	import {
		convertVoiQuotedCandlesToUsd,
		convertVoiQuotedVolumesToUsd,
		clampCandlesByMAD
	} from '$lib/utils/price-conversion';
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
	$: ({ marketData, aggregates, circulatingSupply, tokenPairs, tokenAnalytics } = data);
	
	// Debug: Let's see what we're actually getting (temporary)
	$: {
		if (browser && marketData) {
			console.log('Page data received:', data);
			console.log('marketData length:', marketData?.length);
			console.log('first market:', marketData?.[0]); 
			console.log('aggregates:', aggregates); 
			console.log('circulatingSupply:', circulatingSupply);
		}
	}
	
	// Use the data we receive, but fall back to empty structures
	$: realMarketData = Array.isArray(marketData) ? marketData : [];
	$: fallbackPairs = Array.isArray(tokenPairs) ? tokenPairs : [];
	$: realCirculatingSupply = circulatingSupply || { circulatingSupply: 0, percentDistributed: 0 };

	// New token-based state
	let selectedToken: UniqueToken | null = null;
	let selectedPool: TokenPair | null = null;
	let poolsLoading = false;
	let legacySelectedToken: string = 'VOI';

	// Token overview and analytics state
	let tokenInfo: any = null;
	let tokenInfoLoading = false; // For VOI market data compatibility

	// Enhanced UI state
	let viewMode: 'table' | 'heatmap' | 'galaxy' | 'comparison' | 'mobile' = 'table';
	let commandPaletteOpen = false;

	let watchlistOpen = false;
	let comparisonTokens: UniqueToken[] = [];
	let selectedTokens: UniqueToken[] = [];
	let allTokens: UniqueToken[] = [];
	let isMobile = false;
    let showAdvancedFeatures = false;

	// Real-time updates
	let lastUpdateTime = new Date();
	let updateInterval: NodeJS.Timeout;

	// Simple search functionality
	let searchQuery = '';
	let filteredMarketData = realMarketData;

	// Initialize selected token from URL (?token=ID) or default to VOI
	let _initTokenOnce = false;
	async function initSelectedTokenFromUrl() {
		try {
			const url = $page.url;
			const tokenParam = url.searchParams.get('token');
			const poolParam = url.searchParams.get('pool');

			// If numeric ID, resolve token details from token-pairs
			if (tokenParam && /^\d+$/.test(tokenParam)) {
				const res = await fetch(`/api/token-pairs?tokenId=${tokenParam}&limit=50`);
				const data = await res.json();
				const id = parseInt(tokenParam, 10);
				if (data?.pairs?.length) {
					// Prefer a pair that explicitly includes our ID
					const match =
						data.pairs.find((p: any) => p.baseTokenId === id || p.quoteTokenId === id) ||
						data.pairs[0];
					const isBase = match.baseTokenId === id;
					const rawSymbol = isBase ? match.baseSymbol : match.quoteSymbol;
					const decimals = isBase ? match.baseDecimals : match.quoteDecimals;
					const normSymbol =
						(rawSymbol || '').toUpperCase() === 'WVOI' ? 'VOI' : rawSymbol || 'VOI';
					selectedToken = {
						id,
						symbol: normSymbol,
						decimals: typeof decimals === 'number' ? decimals : 6,
						type: normSymbol.toUpperCase() === 'VOI' ? 'VOI' : 'UNKNOWN',
						poolCount: 0
					};
					selectedTokens = [selectedToken]; // Initialize selectedTokens
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
			} else if (tokenParam) {
				// Symbol provided: resolve token info and set selectedToken
				const symbol = tokenParam.toUpperCase();
				try {
					const res = await fetch(`/api/token-info?symbol=${encodeURIComponent(symbol)}`);
					const infoJson = await res.json();
					if (infoJson?.info) {
						const info = infoJson.info;
						const normSymbol = info.symbol?.toUpperCase() === 'WVOI' ? 'VOI' : info.symbol || symbol;
						selectedToken = {
							id: info.tokenId ?? 0,
							symbol: normSymbol,
							decimals: typeof info.decimals === 'number' ? info.decimals : 6,
							type: (info.type || 'UNKNOWN') as 'VOI' | 'ARC200' | 'ASA' | 'UNKNOWN',
							poolCount: 0
						};
						selectedTokens = [selectedToken];
						// Try to preselect pool if provided
						if (poolParam && /^\d+$/.test(poolParam)) {
							try {
								const pairsRes = await fetch(`/api/token-pairs?tokenSymbol=${encodeURIComponent(normSymbol)}&limit=200`);
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
								console.warn('Failed to init pool from URL (symbol):', e);
							}
						}
						return;
					}
				} catch (e) {
					console.warn('Failed to init token from URL (symbol):', e);
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
		selectedTokens = [selectedToken]; // Initialize selectedTokens
	}

	$: if (browser && !_initTokenOnce && !selectedToken) {
		_initTokenOnce = true;
		initSelectedTokenFromUrl();
	}

	// Detect mobile device
	$: if (browser) {
		isMobile = window.innerWidth < 768;
		if (isMobile && viewMode !== 'mobile') {
			viewMode = 'mobile';
		}
	}

	onMount(() => {
		loadAllTokens();
		setupRealTimeUpdates();
		setupKeyboardShortcuts();
		
		// Responsive handling
		const handleResize = () => {
			isMobile = window.innerWidth < 768;
		};
		window.addEventListener('resize', handleResize);
		
		return () => {
			window.removeEventListener('resize', handleResize);
			if (updateInterval) clearInterval(updateInterval);
		};
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

	function setupRealTimeUpdates() {
		updateInterval = setInterval(() => {
			lastUpdateTime = new Date();
			// Refresh data periodically
			if (browser) {
				invalidateAll();
			}
		}, 30000); // Update every 30 seconds
	}

	function setupKeyboardShortcuts() {
		const handleKeydown = (event: KeyboardEvent) => {
			// Command palette (Cmd/Ctrl + K)
			if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
				event.preventDefault();
				commandPaletteOpen = true;
			}
					// Search (Cmd/Ctrl + F)
		else if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
			event.preventDefault();
			// Focus search input instead of opening filter builder
			const searchInput = document.querySelector('#market-search') as HTMLInputElement;
			if (searchInput) searchInput.focus();
		}
			// Watchlist (Cmd/Ctrl + W)
			else if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
				event.preventDefault();
				watchlistOpen = true;
			}
			// View mode shortcuts
			else if ((event.metaKey || event.ctrlKey) && event.key >= '1' && event.key <= '4') {
				event.preventDefault();
				const modes: (typeof viewMode)[] = ['table', 'heatmap', 'galaxy', 'comparison'];
				viewMode = modes[parseInt(event.key) - 1];
			}
		};
		
		if (browser) {
			document.addEventListener('keydown', handleKeydown);
		}
	}

	// Enhanced event handlers
	function handleCommandPaletteAction(event: CustomEvent<any>) {
		const { type, data } = event.detail;
		
		switch (type) {
			case 'heatmap':
				viewMode = 'heatmap';
				break;
			case 'galaxy':
				viewMode = 'galaxy';
				break;
			case 'compare':
				viewMode = 'comparison';
				break;
			case 'filter':
				// Filter functionality removed - using simple search instead
				break;
			case 'watchlist':
				watchlistOpen = true;
				break;
			case 'naturalLanguage':
				// Natural language queries not implemented in this version
				break;
		}
	}

	// Simple search function for markets
	function filterMarkets(query: string) {
		if (!query.trim()) {
			filteredMarketData = realMarketData;
			return;
		}
		
		const searchTerm = query.toLowerCase();
		filteredMarketData = realMarketData.filter(market => 
			market.pair.toLowerCase().includes(searchTerm) ||
			market.exchange.toLowerCase().includes(searchTerm) ||
			market.network.toLowerCase().includes(searchTerm)
		);
	}

	function handleTokenComparison(tokens: UniqueToken[]) {
		comparisonTokens = tokens;
		selectedTokens = tokens; // Keep selectedTokens in sync
		viewMode = 'comparison';
	}

	// Keep legacy token string for VOI market data compatibility
	$: if (selectedToken) {
		legacySelectedToken = selectedToken.symbol;
		fetchTokenInfo(selectedToken.id);
	}

	// Fetch token info when token changes
	async function fetchTokenInfo(tokenId: number) {
		tokenInfoLoading = true;
		try {
			const response = await fetch(`/api/token-info?tokenId=${tokenId}`);
			const data = await response.json();
			if (data.info) {
				tokenInfo = data.info;
			} else {
				tokenInfo = null;
			}
		} catch (error) {
			console.error('Failed to fetch token info:', error);
			tokenInfo = null;
		} finally {
			tokenInfoLoading = false;
		}
	}

	// Use the real market data from server and apply search filter
	$: {
		if (searchQuery.trim()) {
			filterMarkets(searchQuery);
		} else {
			filteredMarketData = realMarketData;
		}
	}

	// Aggregate metrics with fallbacks when markets are empty
    $: totalVolume24h = (() => {
        if (realMarketData.length > 0) {
            const sum = realMarketData.reduce((s, m) => s + (m.volume_24h || 0), 0);
            const ana = tokenAnalytics?.volume?.volume24h ?? 0;
            
            // For VOI, use market data (includes cross-chain), for others prefer analytics
            if (legacySelectedToken === 'VOI') {
                console.log('VOI Volume calculation - using market data instead of inflated analytics:', {
                    marketSum: sum,
                    analyticsSum: ana,
                    using: 'market data (correct)'
                });
                return sum; // Use market data, ignore inflated analytics
            } else {
                // For non-VOI tokens, use market sum (analytics data is inflated)
                console.log('Non-VOI Volume calculation - using market data instead of inflated analytics:', {
                    token: legacySelectedToken,
                    marketSum: sum,
                    analyticsSum: ana,
                    using: 'market data (correct)'
                });
                return sum; // Use market data, ignore inflated analytics
            }
        }
        return tokenAnalytics?.volume?.volume24h ?? 0;
    })();
    
    $: totalTvlAll = (() => {
        if (realMarketData.length > 0) {
            const sum = realMarketData.reduce((s, m) => s + (m.tvl || 0), 0);
            const ana = tokenAnalytics?.tvl?.totalTvl ?? 0;
            
            // For VOI, use market data (includes cross-chain), for others prefer analytics
            if (legacySelectedToken === 'VOI') {
                console.log('VOI TVL calculation:', {
                    marketSum: sum,
                    analyticsSum: ana,
                    using: sum > 0 ? 'market' : 'analytics'
                });
                return sum > 0 ? sum : ana;
            } else {
                // For non-VOI tokens, use market sum (analytics data is inflated)
                console.log('Non-VOI TVL calculation - using market data instead of inflated analytics:', {
                    token: legacySelectedToken,
                    marketSum: sum,
                    analyticsSum: ana,
                    using: 'market data (correct)'
                });
                return sum; // Use market data, ignore inflated analytics
            }
        }
        return tokenAnalytics?.tvl?.totalTvl ?? 0;
    })();
	$: activeMarketsCount = realMarketData.length > 0
		? realMarketData.length
		: (fallbackPairs?.length ?? (tokenAnalytics?.tvl?.poolCount ?? 0));

	let fetchingMarketData = false;
	// Fetch market data for a specific token
	async function fetchMarketDataForToken(tokenSymbol: string) {
		fetchingMarketData = true;
		try {
			const response = await fetch(`/api/markets?token=${encodeURIComponent(tokenSymbol)}`);
			const data = await response.json();
			
			if (data.error) {
				throw new Error(data.error);
			}
			
			if (data.marketData) {
				realMarketData = Array.isArray(data.marketData) ? data.marketData : [];
			}
			if (data.aggregates) {
				aggregates = data.aggregates;
			}
			if (data.circulatingSupply) {
				realCirculatingSupply = data.circulatingSupply;
			}
			
			// For non-VOI tokens, also fetch token analytics
			if (tokenSymbol !== 'VOI' && selectedToken && selectedToken.id !== 0) {
				try {
					const analyticsResponse = await fetch(`/api/token-analytics?tokenId=${selectedToken.id}`);
					const analyticsData = await analyticsResponse.json();
					if (analyticsData.analytics) {
						tokenAnalytics = analyticsData.analytics;
					}
				} catch (e) {
					console.warn('Failed to fetch token analytics:', e);
				}
			} else {
				// Clear analytics for VOI
				tokenAnalytics = null;
			}
			
			console.log(`Fetched market data for ${tokenSymbol}:`, {
				marketDataLength: realMarketData.length,
				aggregates,
				circulatingSupply: realCirculatingSupply,
				tokenAnalytics
			});
		} catch (error) {
			console.error('Failed to fetch market data:', error);
			// Don't clear existing data on error, just show it's failed
		} finally {
			fetchingMarketData = false;
		}
	}

	// Handle token selection
	function handleTokenSelect(event: CustomEvent<UniqueToken>) {
		selectedToken = event.detail;
		selectedTokens = [event.detail]; // Update selectedTokens array
		selectedPool = null; // Reset pool selection when token changes
		selectedTokenPair = null; // Clear token pair as well

		// If switching to VOI, do exactly what the Reset button was doing
		if (selectedToken.symbol.toUpperCase() === 'VOI') {
			selectedToken = {
				id: 0,
				symbol: 'VOI',
				decimals: 6,
				type: 'VOI',
				poolCount: 0
			};
			selectedTokens = [selectedToken]; // Update selectedTokens
			selectedPool = null;
			selectedTokenPair = null;
			legacySelectedToken = 'VOI'; // Update legacySelectedToken
			
			if (browser) {
				// Fetch fresh VOI market data
				fetchMarketDataForToken('VOI');
				fetchUnifiedChartData('VOI', chartSettings.resolution);
				const url = new URL($page.url);
				url.searchParams.set('token', 'VOI');
				url.searchParams.delete('pool');
				goto(url.toString(), { keepFocus: true, noScroll: true, replaceState: true });
			}
		} else {
			// Update legacySelectedToken for non-VOI tokens
			legacySelectedToken = selectedToken.symbol;
			
			if (browser) {
				// Fetch market data for the selected token
				fetchMarketDataForToken(selectedToken.symbol);
				
				// Fetch token chart data for the selected token
				if (selectedToken.id !== 0) {
					fetchTokenChartData(selectedToken.id, chartSettings.resolution);
				}
				
				// Update URL to reflect token selection (use token symbol for better compatibility)
				const url = new URL($page.url);
				url.searchParams.set('token', selectedToken.symbol);
				// Clear pool when switching tokens
				url.searchParams.delete('pool');
				goto(url.toString(), { keepFocus: true, noScroll: true, replaceState: true });
			}
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
				const url = new URL($page.url);
				url.searchParams.set('pool', String(selectedPool.poolId));
				// Ensure token param is present
				if (selectedToken) url.searchParams.set('token', String(selectedToken.id));
				goto(url.toString(), { keepFocus: true, noScroll: true, replaceState: true });
			}
		} else if (selectedToken?.symbol.toUpperCase() === 'VOI') {
			// Clear pool selection for VOI - show aggregated data
			fetchUnifiedChartData('VOI', chartSettings.resolution);
			if (browser) {
				const url = new URL($page.url);
				url.searchParams.delete('pool');
				goto(url.toString(), { keepFocus: true, noScroll: true, replaceState: true });
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
	$: sortedMarketData = [...realMarketData].sort((a, b) => {
		const aValue = a[sortColumn as keyof typeof a];
		const bValue = b[sortColumn as keyof typeof b];

		if (aValue === null || aValue === undefined) return 1;
		if (bValue === null || bValue === undefined) return -1;

		const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
		return sortDirection === 'asc' ? comparison : -comparison;
	});

	// Format number with commas and specified decimal places
	const formatNumber = (num: number | null | undefined, decimals: number = 2): string => {
		if (num === null || num === undefined) return '-';
		const n = Number(num);
		return n.toLocaleString('en-US', {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals
		});
	};

	// Format currency with $ symbol and 4 decimal places
	const formatPrice = (num: number | null | undefined): string => {
		if (num === null || num === undefined) return '-';
		return `$${formatNumber(num, 6)}`;
	};

	// Format currency with $ symbol and 2 decimal places (for volume/TVL)
	const formatCurrency = (num: number | null | undefined): string => {
		if (num === null || num === undefined) return '-';
		return `$${formatNumber(num, 2)}`;
	};

	// Format percentage
	const formatPercentage = (num: number | null | undefined): string => {
		if (num === null || num === undefined) return '-';
		const formatted = formatNumber(num, 2);
		if (formatted === '-') return '-';
		const sign = Number(num) > 0 ? '+' : '';
		return `${sign}${formatted}%`;
	};

	// Calculate volume-weighted average price
	$: weightedAveragePrice = (() => {
		if (!Array.isArray(realMarketData) || realMarketData.length === 0) return 0;
		
		// Filter out obviously wrong prices only for VOI
		let filteredMarkets = realMarketData.filter(m => m.price != null && m.price > 0);
		
		// For VOI only, filter out inflated prices
		if (legacySelectedToken === 'VOI') {
			filteredMarkets = filteredMarkets.filter(m => m.price! < 0.01); // Allow up to 1 cent for VOI
		}
		
		const marketsWithPriceAndVolume = filteredMarkets.filter(
			(m) => m.price != null && m.price > 0 && m.volume_24h != null && m.volume_24h > 0
		);

		if (marketsWithPriceAndVolume.length === 0) {
			// If no markets have both price and volume, use any valid prices
			if (filteredMarkets.length > 0) {
				// Use median price to avoid outliers
				const prices = filteredMarkets.map(m => m.price || 0).sort((a, b) => a - b);
				return prices[Math.floor(prices.length / 2)];
			}
			return 0;
		}

		const totalWeightedPrice = marketsWithPriceAndVolume.reduce(
			(sum: number, market: MarketData) => sum + market.price! * market.volume_24h!,
			0
		);

		const totalVolume = marketsWithPriceAndVolume.reduce(
			(sum: number, market: MarketData) => sum + market.volume_24h!,
			0
		);

		const price = totalVolume > 0 ? totalWeightedPrice / totalVolume : 0;
		return price;
	})();

	// Fallback display price from priceHistory when markets have no price
	$: displayPrice = (() => {
		// First try weighted average price from market data
		if (weightedAveragePrice && weightedAveragePrice > 0) {
			return weightedAveragePrice;
		}
		
		// Then try aggregated price from server
		if (aggregates && aggregates.weightedAveragePrice && aggregates.weightedAveragePrice > 0) {
			return aggregates.weightedAveragePrice;
		}
		
		// Finally fall back to price history
		if (Array.isArray(priceHistory) && priceHistory.length) {
			const lastPrice = priceHistory[priceHistory.length - 1]?.value;
			if (lastPrice && lastPrice > 0) {
				return lastPrice;
			}
		}
		
		return 0;
	})();

	// Calculate market caps
	// VOI: use circulating supply from server; Others: use totalSupply from tokenInfo (FDV)
	$: circulatingMarketCap = legacySelectedToken === 'VOI'
		? weightedAveragePrice * Number(circulatingSupply.circulatingSupply)
		: 0;
	$: tokenTotalSupplyAdjusted = tokenInfo?.totalSupply != null && tokenInfo?.decimals != null
		? tokenInfo.totalSupply / Math.pow(10, tokenInfo.decimals)
		: null;
	$: fullyDilutedMarketCap = tokenTotalSupplyAdjusted
		? weightedAveragePrice * tokenTotalSupplyAdjusted
		: legacySelectedToken === 'VOI'
		? weightedAveragePrice * 10_000_000_000
		: 0;

	let isRefreshing = false;
	async function refreshData() {
		if (!browser) return;
		isRefreshing = true;
		try {
			// Refresh market data for the currently selected token
			if (selectedToken && selectedToken.symbol) {
				await fetchMarketDataForToken(selectedToken.symbol);
			} else {
				await fetchMarketDataForToken('VOI');
			}
			// Also invalidate all other data
			await invalidateAll();
		} finally {
			isRefreshing = false;
		}
	}

	let selectedPeriod: '24h' | '7d' = '24h';
	let priceHistory = data.priceHistory;

	async function handlePeriodChange(period: '24h' | '7d') {
		selectedPeriod = period;
		const response = await fetch(
			`/api/price-history?period=${period}${selectedTradingPairId ? `&trading_pair_id=${selectedTradingPairId}` : ''}&token=${legacySelectedToken}`
		);
		priceHistory = await response.json();
	}

	let selectedTradingPairId: number | null = null;
	let selectedMarket: { exchange: string; pair: string; trading_pair_id: number } | null = null;

	async function handleMarketClick(market: MarketData) {
		if (selectedTradingPairId === market.trading_pair_id) {
			selectedTradingPairId = null;
			selectedMarket = null;
		} else {
			selectedTradingPairId = market.trading_pair_id;
			selectedMarket = {
				exchange: market.exchange,
				pair: market.pair,
				trading_pair_id: market.trading_pair_id
			};
		}
		const response = await fetch(
			`/api/price-history?trading_pair_id=${selectedTradingPairId}&period=${selectedPeriod}&token=${legacySelectedToken}`
		);
		priceHistory = await response.json();
	}

    // Fallback: clicking a pair when server markets are empty
    async function handlePairClick(pair: TokenPair) {
		selectedTradingPairId = null;
		selectedMarket = {
			exchange: 'DEX',
			pair: `${pair.baseSymbol}/${pair.quoteSymbol}`,
			trading_pair_id: pair.poolId ?? 0
		};
		const params = new URLSearchParams({
			baseTokenId: String(pair.baseTokenId),
			quoteTokenId: String(pair.quoteTokenId),
			resolution: chartSettings.resolution || '1h',
			limit: '240'
		});
		try {
			const res = await fetch(`/api/ohlcv?${params.toString()}`);
			const json = await res.json();
			if (json?.candles) {
				priceHistory = json.candles.map((c: any) => ({ time: c.time, value: c.close }));
    }

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
        const res = await fetch(`/api/ohlcv?baseTokenId=${baseId}&quoteTokenId=${quoteId}&resolution=${chartSettings.resolution}&limit=500`);
        const json = await res.json();
        let candles = json?.candles || [];
        const quoteSym = (market.pair.split('/')[1] || '').toUpperCase();
        // If quote is VOI or WVOI, convert to USD using VOI reference series
        if (candles.length && (quoteSym === 'VOI' || quoteSym === 'WVOI')) {
            try {
                const refRes = await fetch('/api/price-history?period=24h&token=VOI');
                const refJson = await refRes.json();
                candles = convertVoiQuotedCandlesToUsd(candles, refJson);
            } catch (e) {
                console.warn('USD normalization failed; showing VOI quote');
            }
        }
        // Map to line data for PriceChart
        priceHistory = (candles || []).map((c: any) => ({ time: c.time, value: c.close }));
    }
		} catch (e) {
			console.warn('Failed to load pair OHLCV:', e);
		}
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

	// Chart display state
	let showTokenChart = false;
	let tokenChartData: OHLCVData[] = [];
	let tokenChartVolumes: VolumeData[] = [];
	let tokenChartLoading = false;
	let tokenChartError = '';
	let currentQuoteCurrency: 'VOI' | 'USD' = 'VOI';

	// Initialize chart settings based on selected token
	$: if (legacySelectedToken) {
		chartSettings.chartType = getDefaultChartType(legacySelectedToken);
		chartSettings.resolution = getDefaultResolution(legacySelectedToken);
	}

	// Fetch chart data for selected token paired with VOI or USD
	async function fetchTokenChartData(tokenId: number, resolution: Resolution = '1h', quoteCurrency: 'VOI' | 'USD' = 'VOI') {
		if (!tokenId || tokenId === 0) return; // Skip for native VOI
		
		tokenChartLoading = true;
		tokenChartError = '';
		
		try {
			let chartData: OHLCVData[] = [];
			let volumeData: VolumeData[] = [];
			
			if (quoteCurrency === 'USD') {
				// For USD, we need to convert VOI-quoted data to USD
				// First get VOI-quoted data
				const voiResponse = await fetch(`/api/ohlcv?baseTokenId=${tokenId}&quoteTokenId=390001&resolution=${resolution}&limit=240`);
				const voiData = await voiResponse.json();
				
				if (voiData.candles && voiData.candles.length > 0) {
					// Get VOI USD reference data for conversion
					const voiUsdResponse = await fetch(`/api/price-history?period=24h&token=VOI`);
					const voiUsdData = await voiUsdResponse.json();
					
					if (voiUsdData && Array.isArray(voiUsdData) && voiUsdData.length > 0) {
						// Convert VOI prices to USD using the conversion utility
						const { convertVoiQuotedCandlesToUsd, convertVoiQuotedVolumesToUsd } = await import('$lib/utils/price-conversion');
						chartData = convertVoiQuotedCandlesToUsd(voiData.candles, voiUsdData);
						volumeData = voiData.volumes ? convertVoiQuotedVolumesToUsd(voiData.volumes, voiUsdData) : [];
					} else {
						// Fallback to VOI data if USD conversion fails
						chartData = voiData.candles;
						volumeData = voiData.volumes || [];
					}
				}
			} else {
				// For VOI, try wVOI first (390001), then fall back to native VOI (0)
				const wvoiResponse = await fetch(`/api/ohlcv?baseTokenId=${tokenId}&quoteTokenId=390001&resolution=${resolution}&limit=240`);
				const wvoiData = await wvoiResponse.json();
				
				if (wvoiData.candles && wvoiData.candles.length > 0) {
					chartData = wvoiData.candles;
					volumeData = wvoiData.volumes || [];
				} else {
					// Fall back to native VOI as quote token
					const voiResponse = await fetch(`/api/ohlcv?baseTokenId=${tokenId}&quoteTokenId=0&resolution=${resolution}&limit=240`);
					const voiData = await voiResponse.json();
					
					if (voiData.candles && voiData.candles.length > 0) {
						chartData = voiData.candles;
						volumeData = voiData.volumes || [];
					}
				}
			}
			
			if (chartData.length > 0) {
				tokenChartData = chartData;
				tokenChartVolumes = volumeData;
				showTokenChart = true;
			} else {
				tokenChartError = 'No chart data available for this token';
				showTokenChart = false;
			}
		} catch (error) {
			console.error('Error fetching token chart data:', error);
			tokenChartError = 'Failed to load chart data';
			showTokenChart = false;
		} finally {
			tokenChartLoading = false;
		}
	}

	// Watch for token selection changes and fetch chart data
	$: if (selectedToken && selectedToken.id !== 0) {
		fetchTokenChartData(selectedToken.id, chartSettings.resolution);
	} else if (selectedToken && selectedToken.id === 0) {
		// For VOI, show aggregated data instead of chart
		showTokenChart = false;
		tokenChartData = [];
		tokenChartVolumes = [];
	}

	// Handle chart resolution changes
	async function handleChartResolutionChange(resolution: Resolution) {
		chartSettings.resolution = resolution;
		if (selectedToken && selectedToken.id !== 0) {
			await fetchTokenChartData(selectedToken.id, resolution);
		}
	}

	// Handle chart type changes
	function handleChartTypeChange(chartType: 'candlestick' | 'line') {
		chartSettings.chartType = chartType;
	}

	// Unified Chart Functions
	let fetchSeq = 0;
	async function fetchUnifiedChartData(
		token: string,
		resolution: Resolution,
		refresh = false,
		tradingPairId?: number
	) {
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
			} else if (shouldUseVOIData(token)) {
				// Use VOI data as simple line chart data - don't convert to OHLCV
				const period = resolution === '1h' ? '7d' : '24h';
				const response = await fetch(
					`/api/price-history?period=${period}${tradingPairId ? `&trading_pair_id=${tradingPairId}` : ''}&token=${token}`
				);
				const voiPriceHistory = await response.json();

				if (voiPriceHistory.error) {
					throw new Error(voiPriceHistory.error);
				}

				const voiCandles = voiPriceHistory.map((point: any) => {
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

	function handleUnifiedRefresh(
		event: CustomEvent<{ tokenPair: TokenPair; resolution: Resolution }>
	) {
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

<!-- Modern Token Analytics Interface -->
<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Market Overview Header -->
	<div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
			<!-- Main Market Info -->
			<div class="mb-6">
				<!-- Bottom Row: Token Info, Price, and Controls -->
				<div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
					<!-- Left Side: Token Info and Price -->
					<div class="flex items-center gap-6">
						<!-- Token Info -->
						<div class="flex items-center gap-4">
							<!-- Token Image/Icon -->
							{#if data.pageMetaTags?.imageUrl && data.pageMetaTags.imageUrl !== 'https://voirewards.com/android-chrome-192x192.png'}
								<img 
									src={data.pageMetaTags.imageUrl} 
									alt="{legacySelectedToken} logo"
									class="w-16 h-16 rounded-2xl object-cover bg-white"
									on:error={(e) => {
										e.currentTarget.style.display = 'none';
										e.currentTarget.nextElementSibling.style.display = 'flex';
									}}
								/>
								<div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center" style="display: none;">
									<i class="fas fa-coins text-white text-2xl"></i>
								</div>
							{:else}
								<div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
									<i class="fas fa-coins text-white text-2xl"></i>
								</div>
							{/if}
							
							<div>
								<div class="flex items-center gap-3 mb-1">
									<h1 class="text-3xl font-bold text-gray-900 dark:text-white">
										{legacySelectedToken || 'VOI'}
									</h1>
									<Badge class="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
										{realMarketData.length} Markets
									</Badge>
								</div>
								<p class="text-lg text-gray-600 dark:text-gray-400">
									Volume-weighted average price across all exchanges
								</p>
							</div>
						</div>

						<!-- Price Display -->
						<div class="text-center lg:text-right">
							<div class="flex items-center justify-center lg:justify-end gap-3">
								<div class="text-4xl font-bold text-gray-900 dark:text-white">{formatPrice(displayPrice)}</div>
								{#if fetchingMarketData}
									<Spinner size="6" />
								{/if}
							</div>
							<div class="text-sm text-gray-500 dark:text-gray-400">
								{#if fetchingMarketData}
									Updating price data...
								{:else}
									Last updated: {new Date().toLocaleTimeString()}
								{/if}
							</div>
						</div>
					</div>

					<!-- Right Side Controls -->
					<div class="flex items-center gap-3">
						<TokenSelector 
							{selectedToken}
							{allTokens}
							on:tokenSelect={handleTokenSelect}
						/>
						
						<Button 
							size="sm" 
							color="alternative"
							on:click={refreshData}
							disabled={isRefreshing}
						>
							<i class="fas fa-sync-alt {isRefreshing ? 'animate-spin' : ''} mr-2"></i>
							Refresh
						</Button>
					</div>
				</div>
			</div>

			<!-- Key Metrics -->
			<div class="grid grid-cols-2 md:grid-cols-4 gap-6 mb-4">
				<!-- Total Volume -->
				<div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
					<div class="flex items-center justify-between mb-2">
						<h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">24h Volume</h3>
						<i class="fas fa-chart-bar text-blue-500"></i>
					</div>
					<div class="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalVolume24h)}</div>
				</div>

				<!-- Total TVL -->
				<div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
					<div class="flex items-center justify-between mb-2">
						<h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">Total TVL</h3>
						<i class="fas fa-lock text-green-500"></i>
					</div>
					<div class="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalTvlAll)}</div>
				</div>

				<!-- Market Cap / FDV -->
				<div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
					<div class="flex items-center justify-between mb-2">
						<h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">
							{legacySelectedToken === 'VOI' ? 'Market Cap' : 'FDV'}
						</h3>
						<i class="fas fa-coins text-purple-500"></i>
					</div>
					<div class="text-2xl font-bold text-gray-900 dark:text-white">
						{legacySelectedToken === 'VOI' 
							? formatCurrency(circulatingMarketCap)
							: tokenTotalSupplyAdjusted != null 
								? formatCurrency(fullyDilutedMarketCap) 
								: '-'}
					</div>
					<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {#if legacySelectedToken === 'VOI'}
                        Circulating: {formatNumber(realCirculatingSupply.circulatingSupply, 0)}
                    {:else}
                        Total Supply: {tokenTotalSupplyAdjusted != null ? formatNumber(tokenTotalSupplyAdjusted, 0) : '—'}
                    {/if}
                </div>
				</div>

				<!-- Active Markets -->
				<div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
					<div class="flex items-center justify-between mb-2">
						<h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">Active Markets</h3>
						<i class="fas fa-exchange-alt text-orange-500"></i>
					</div>
					<div class="text-2xl font-bold text-gray-900 dark:text-white">{activeMarketsCount}</div>
					<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
						Across {new Set(realMarketData.map(m => m.exchange)).size} exchanges
					</div>
				</div>
			</div>

			<!-- Chart + Markets side-by-side -->
            <section class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div class="lg:col-span-2 {showTokenChart && selectedToken && selectedToken.id !== 0 ? 'p-0' : 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4'}">
                    {#if showTokenChart && selectedToken && selectedToken.id !== 0}
                        {#if tokenChartLoading}
                            <div class="flex items-center justify-center h-64 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                                <Spinner size="8" />
                                <span class="ml-2 text-gray-600 dark:text-gray-400">Loading chart...</span>
                            </div>
                        {:else if tokenChartError}
                            <div class="flex items-center justify-center h-64 text-center bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                                <div>
                                    <i class="fas fa-exclamation-triangle text-2xl text-yellow-500 mb-2"></i>
                                    <p class="text-gray-600 dark:text-gray-400">{tokenChartError}</p>
                                </div>
                            </div>
                        {:else if tokenChartData.length > 0}
                            <OHLCVChart 
                                tokenPair={{
                                    baseTokenId: selectedToken.id,
                                    quoteTokenId: 390001, // wVOI
                                    baseSymbol: selectedToken.symbol,
                                    quoteSymbol: 'VOI',
                                    baseDecimals: selectedToken.decimals,
                                    quoteDecimals: 6,
                                    poolId: undefined
                                }}
                                data={tokenChartData}
                                volumes={tokenChartVolumes}
                                loading={false}
                                height={400}
                                settings={chartSettings}
                                on:refreshData
                                on:resolutionChange={handleChartResolutionChange}
                                on:chartTypeChange={handleChartTypeChange}
                                on:quoteChange={(e) => {
									console.log('quoteChange event received in markets page:', e.detail);
									currentQuoteCurrency = e.detail;
									console.log('currentQuoteCurrency updated to:', currentQuoteCurrency);
									fetchTokenChartData(selectedToken.id, chartSettings.resolution, currentQuoteCurrency);
								}}
                            />
                        {/if}
                    {:else}
                        <!-- Default Price Chart for VOI or when no token selected -->
                        <PriceChart 
                            data={priceHistory}
                            selectedPeriod={selectedPeriod}
                            onPeriodChange={handlePeriodChange}
                            selectedMarket={selectedMarket}
                        />
                    {/if}
                </div>
                <div class="lg:col-span-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div class="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-600">
                        <div class="flex items-center justify-between mb-4">
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Token Markets</h2>
                            <span class="text-sm text-gray-600 dark:text-gray-400">{filteredMarketData.length} active</span>
                        </div>
                        
                        <!-- Search Bar -->
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <i class="fas fa-search text-gray-400"></i>
                            </div>
                            <input
                                id="market-search"
                                type="text"
                                bind:value={searchQuery}
                                on:input={() => filterMarkets(searchQuery)}
                                placeholder="Search markets, exchanges, networks..."
                                class="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:focus:ring-purple-400 dark:focus:border-purple-400"
                            />
                            {#if searchQuery}
                                <button
                                    type="button"
                                    on:click={() => {
                                        searchQuery = '';
                                        filterMarkets('');
                                    }}
                                    class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                >
                                    <i class="fas fa-times"></i>
                                </button>
                            {/if}
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full">
                            <thead class="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pair</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">TVL (USD)</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">24h Volume</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">24h Change</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {#each filteredMarketData.slice(0, 50) as market}
                                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer" on:click={() => handleMarketRowClick(market)}>
                                        <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">{market.pair}</td>
                                        <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">{formatCurrency(market.tvl)}</td>
                                        <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">{formatCurrency(market.volume_24h)}</td>
                                        <td class="px-6 py-3 whitespace-nowrap text-sm">
                                            <span class="{(market.price_change_percentage_24h ?? 0) > 0 ? 'text-green-600 dark:text-green-400' : (market.price_change_percentage_24h ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}">
                                                {formatPercentage(market.price_change_percentage_24h)}
                                            </span>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

			<!-- Main Content Area - Clean Views -->
			{#if viewMode === 'heatmap'}
				<!-- Token Performance Heatmap -->
				<div transition:fade={{ duration: 200 }}>
					<TokenHeatmap 
						tokens={allTokens} 
						loading={isLoading}
						on:tokenSelect={handleTokenSelect}
						on:tokenHover
						on:compare={handleTokenComparison}
					/>
				</div>

			{:else if viewMode === 'galaxy'}
				<!-- 3D Token Galaxy Visualization -->
				<div class="h-[600px] bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700" transition:fade={{ duration: 200 }}>
					<TokenGalaxy 
						tokens={allTokens}
						{selectedToken}
						loading={isLoading}
						on:tokenSelect={handleTokenSelect}
						on:tokenHover
					/>
				</div>

			{:else if viewMode === 'comparison'}
				<!-- Token Comparison Interface -->
				<div transition:fade={{ duration: 200 }}>
					{#if comparisonTokens.length > 0}
						<TokenComparison 
							tokens={comparisonTokens}
							on:close={() => viewMode = 'heatmap'}
							on:addToken={() => commandPaletteOpen = true}
							on:removeToken={(e) => {
								comparisonTokens = comparisonTokens.filter(t => t.id !== e.detail.id);
								selectedTokens = comparisonTokens;
							}}
							on:export
						/>
						
						<!-- Radar Chart for Multi-dimensional Analysis -->
						{#if comparisonTokens.length > 1}
							<div class="mt-6">
								<MetricsRadar 
									tokens={allTokens}
									selectedTokens={comparisonTokens}
									on:tokenSelect={handleTokenSelect}
									on:tokenHover
									on:metricSelect
								/>
							</div>
						{/if}
					{:else}
						<!-- Empty Comparison State -->
						<div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
							<div class="max-w-md mx-auto">
								<i class="fas fa-balance-scale text-4xl text-gray-400 mb-4"></i>
								<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
									Start Token Comparison
								</h3>
								<p class="text-gray-600 dark:text-gray-400 mb-6">
									Select tokens from other views or use the search to add them for comparison analysis.
								</p>
								<div class="flex flex-col sm:flex-row gap-3 justify-center">
									<Button color="purple" on:click={() => commandPaletteOpen = true}>
										<i class="fas fa-search mr-2"></i>
										Search Tokens
									</Button>
									<Button color="alternative" on:click={() => viewMode = 'heatmap'}>
										<i class="fas fa-th mr-2"></i>
										Browse Heatmap
									</Button>
								</div>
							</div>
						</div>
					{/if}
				</div>

			{:else if showAdvancedFeatures}
				<!-- Enhanced Table View (hidden when advanced features off) -->
				<div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden" transition:fade={{ duration: 200 }}>
					<!-- Table Header -->
					<div class="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-600">
						<div class="flex items-center justify-between">
							<div>
								<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
									Token Markets
								</h2>
								<p class="text-sm text-gray-600 dark:text-gray-400">
									{realMarketData.length} trading pairs • Updated {lastUpdateTime.toLocaleTimeString()}
								</p>
							</div>
							<Button
								color="alternative"
								size="sm"
								disabled={isRefreshing}
								on:click={refreshData}
							>
								<i class="fas fa-sync-alt {isRefreshing ? 'animate-spin' : ''} mr-2"></i>
								Refresh
							</Button>
						</div>
					</div>

					<!-- Table Content -->
					<div class="overflow-x-auto">
						{#if isRefreshing}
							<div class="flex items-center justify-center py-12">
								<div class="text-center">
									<Spinner size="8" class="mb-3" />
									<p class="text-gray-600 dark:text-gray-400 text-sm">Refreshing data...</p>
								</div>
							</div>
						{:else if realMarketData.length > 0}
							<table class="w-full">
								<thead class="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('pair')}>
											Token Pair
											{#if sortColumn === 'pair'}
												<i class="fas fa-sort-{sortDirection === 'asc' ? 'up' : 'down'} ml-1"></i>
											{/if}
										</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('price')}>
											Price
											{#if sortColumn === 'price'}
												<i class="fas fa-sort-{sortDirection === 'asc' ? 'up' : 'down'} ml-1"></i>
											{/if}
										</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('price_change_percentage_24h')}>
											24h Change
											{#if sortColumn === 'price_change_percentage_24h'}
												<i class="fas fa-sort-{sortDirection === 'asc' ? 'up' : 'down'} ml-1"></i>
											{/if}
										</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('volume_24h')}>
											24h Volume
											{#if sortColumn === 'volume_24h'}
												<i class="fas fa-sort-{sortDirection === 'asc' ? 'up' : 'down'} ml-1"></i>
											{/if}
										</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" on:click={() => sortData('exchange')}>
											Exchange
											{#if sortColumn === 'exchange'}
												<i class="fas fa-sort-{sortDirection === 'asc' ? 'up' : 'down'} ml-1"></i>
											{/if}
										</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
											Actions
										</th>
									</tr>
								</thead>
								<tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
									{#each sortedMarketData.slice(0, 50) as market, i}
										<tr class="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors" on:click={() => handleMarketClick(market)}>
											<!-- Token Pair -->
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="flex items-center">
													<div class="flex items-center -space-x-2 mr-3">
														<!-- First token icon -->
														<div class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-800">
															{market.pair.split('/')[0].slice(0, 2)}
														</div>
														<!-- Second token icon -->
														<div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-green-500 flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-800">
															{market.pair.split('/')[1].slice(0, 2)}
														</div>
													</div>
													<div>
														<div class="font-medium text-gray-900 dark:text-white">
															{market.pair}
														</div>
														<div class="text-sm text-gray-500 dark:text-gray-400">
															{market.network} • {market.exchange}
														</div>
													</div>
												</div>
											</td>

											<!-- Price -->
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="text-sm font-medium text-gray-900 dark:text-white">
													{formatPrice(market.price)}
												</div>
											</td>

											<!-- 24h Change -->
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="flex items-center">
													<span class="text-sm font-medium {
														(market.price_change_percentage_24h ?? 0) > 0
															? 'text-green-600 dark:text-green-400'
															: (market.price_change_percentage_24h ?? 0) < 0
																? 'text-red-600 dark:text-red-400'
																: 'text-gray-600 dark:text-gray-400'
													}">
														{#if (market.price_change_percentage_24h ?? 0) > 0}
															<i class="fas fa-arrow-up mr-1"></i>
														{:else if (market.price_change_percentage_24h ?? 0) < 0}
															<i class="fas fa-arrow-down mr-1"></i>
														{/if}
														{formatPercentage(market.price_change_percentage_24h)}
													</span>
												</div>
											</td>

											<!-- 24h Volume -->
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="text-sm text-gray-900 dark:text-white">
													{formatCurrency(market.volume_24h)}
												</div>
											</td>

											<!-- Exchange -->
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="flex items-center">
													<Badge class="text-xs {
														market.type === 'CEX'
															? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
															: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
													}">
														{market.exchange}
													</Badge>
												</div>
											</td>

											<!-- Actions -->
											<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
												<div class="flex items-center gap-2">
													{#if market.pool_url}
														<a 
															href={market.pool_url}
															target="_blank"
															rel="noopener noreferrer"
															class="inline-flex items-center px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
															on:click|stopPropagation
														>
															<i class="fas fa-external-link-alt"></i>
														</a>
													{/if}
													<button 
														type="button"
														class="inline-flex items-center px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
														on:click|stopPropagation={(e) => {
															e.stopPropagation();
															const token = {
																id: market.trading_pair_id,
																symbol: market.pair.split('/')[0],
																type: 'UNKNOWN',
																decimals: 6,
																poolCount: 1
															};
															if (!comparisonTokens.find(t => t.id === token.id)) {
																comparisonTokens = [...comparisonTokens, token];
																selectedTokens = comparisonTokens;
															}
														}}
													>
														<i class="fas fa-plus"></i>
													</button>
												</div>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{:else if fallbackPairs.length > 0}
							<!-- Fallback pairs listing when markets API returns none -->
							<table class="w-full">
								<thead class="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Token Pair</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pool</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
									</tr>
								</thead>
								<tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
									{#each fallbackPairs as pair}
										<tr class="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors" on:click={() => handlePairClick(pair)}>
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="font-medium text-gray-900 dark:text-white">
													{pair.baseSymbol}/{pair.quoteSymbol}
												</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
												ID {pair.poolId}
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm">
												<Button size="xs" color="alternative">Load Chart</Button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{:else}
							<div class="text-center py-12">
								<i class="fas fa-chart-bar text-4xl text-gray-400 mb-4"></i>
								<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No Market Data</h3>
								<p class="text-gray-600 dark:text-gray-400">No trading pairs found. Try refreshing or adjusting your filters.</p>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
	{#if showAdvancedFeatures}
		<!-- Enhanced Components -->
		<!-- Command Palette -->
		<CommandPalette 
			bind:open={commandPaletteOpen}
			{selectedTokens}
			on:tokenSelect={handleTokenSelect}
			on:compare={handleTokenComparison}
			on:watchlist
			on:action={handleCommandPaletteAction}
			on:close={() => commandPaletteOpen = false}
		/>



		<!-- Watchlist Manager -->
		<WatchlistManager 
			bind:open={watchlistOpen}
			on:tokenSelect={handleTokenSelect}
			on:compare={handleTokenComparison}
			on:alert={(e) => {
				if (Notification.permission === 'granted') {
					new Notification(`${e.detail.token.symbol} Alert`, {
						body: `Price ${e.detail.condition} ${e.detail.value}`,
						icon: '/favicon.ico'
					});
				}
			}}
		/>
	{/if}

<style>
	/* Enhanced styles for the new components */
	kbd {
		font-family: ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
		font-size: 0.75rem;
		font-weight: 500;
	}
	
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

	/* Custom scrollbars for better mobile experience */
	.mobile-scroll {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.mobile-scroll::-webkit-scrollbar {
		display: none;
	}

	/* Improved focus indicators for accessibility */
	button:focus-visible,
	select:focus-visible,
	input:focus-visible {
		outline: 2px solid #8b5cf6;
		outline-offset: 2px;
	}
</style>
