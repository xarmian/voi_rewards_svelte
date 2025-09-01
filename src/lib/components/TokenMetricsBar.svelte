<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import type { UniqueToken } from '../../routes/api/tokens/+server';
	import type { TokenPair } from '$lib/types/ohlcv.types';

	export let selectedToken: UniqueToken | null = null;
	export let selectedPool: TokenPair | null = null;
	export let marketData: any[] = [];
	export let aggregates: any = {};
	export let circulatingSupply: any = {};
export let weightedAveragePrice: number = 0;
export let ohlcvData: any[] = [];
export let displayInUSD: boolean = true;
export let quoteSymbol: string | null = null; // Effective quote symbol for displayed prices

	// Token supply data
	let tokenSupplyData: { tokenId: number; totalSupply: number; }[] = [];
	
	// Fetch supply data when token changes (for non-VOI tokens)
	$: if (selectedToken && selectedToken.symbol.toUpperCase() !== 'VOI') {
		console.log('Selected token details:', selectedToken);
		fetchTokenSupply(selectedToken.id);
	}

	async function fetchTokenSupply(tokenId: number) {
		console.log('Fetching supply for token ID:', tokenId);
		try {
			const response = await fetch(`/api/token-supply?tokenIds=${tokenId}`);
			const data = await response.json();
			console.log('Supply API response:', data);
			if (!data.error) {
				tokenSupplyData = data.supplies || [];
				console.log('Token supply data set to:', tokenSupplyData);
			} else {
				console.error('Supply API error:', data.error);
			}
		} catch (error) {
			console.error('Failed to fetch token supply:', error);
			tokenSupplyData = [];
		}
	}

	// Calculate token-specific metrics
	$: tokenMetrics = (() => {
		if (!selectedToken) return null;

		const isVOI = selectedToken.symbol.toUpperCase() === 'VOI';
		
		if (isVOI && !selectedPool) {
			// VOI aggregated metrics
			const totalVolume = aggregates.totalVolume || 0;
			const totalTvl = aggregates.totalTvl || 0;
			const marketCap = weightedAveragePrice * Number(circulatingSupply.circulatingSupply || 0);
			const fullyDilutedMarketCap = weightedAveragePrice * 10_000_000_000;
			
			// Calculate 24h change from market data
			const priceChanges = marketData
				.filter(m => m.price_change_percentage_24h != null)
				.map(m => m.price_change_percentage_24h);
			const avgPriceChange = priceChanges.length > 0 
				? priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length 
				: 0;

			return {
				price: weightedAveragePrice,
				priceChange24h: avgPriceChange,
				volume24h: totalVolume,
				marketCap,
				fullyDilutedMarketCap,
				tvl: totalTvl,
				poolCount: selectedToken.poolCount,
				dominantPair: marketData.sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0))[0]?.pair || 'N/A'
			};
		} else if (selectedPool) {
			// Pool-specific metrics
			const poolMarketData = marketData.find(m => m.trading_pair_id === selectedPool.poolId);
			
			// Get latest OHLCV data and derive a 24h window relative to the latest bar
			const latestCandle = ohlcvData[ohlcvData.length - 1];
			const nowTs = latestCandle?.time ?? 0;
			const windowStart = nowTs - 24 * 60 * 60; // last 24 hours
			const last24h = ohlcvData.filter(c => c.time >= windowStart);
			// Fallback to full data if filter yields nothing
			const seriesForWindow = last24h.length > 0 ? last24h : ohlcvData;
			const firstInWindow = seriesForWindow[0];
			const priceChange24h = latestCandle && firstInWindow
				? ((latestCandle.close - firstInWindow.open) / firstInWindow.open) * 100
				: 0;
			// Calculate 24h high/low only within the window
			const high24h = seriesForWindow.reduce((max, candle) => Math.max(max, candle.high), 0);
			const low24h = seriesForWindow.reduce((min, candle) => Math.min(min, candle.low), Infinity);

			// Calculate fully diluted market cap if we have supply data
			const currentPrice = latestCandle?.close || poolMarketData?.price || 0;
			const supplyInfo = tokenSupplyData.find(s => s.tokenId === selectedToken.id);
			const fullyDilutedMarketCap = supplyInfo ? currentPrice * supplyInfo.totalSupply : null;
			
			console.log('Market cap calculation:', {
				selectedTokenId: selectedToken.id,
				currentPrice,
				tokenSupplyData,
				supplyInfo,
				fullyDilutedMarketCap
			});

			return {
				price: currentPrice,
				priceChange24h: poolMarketData?.price_change_percentage_24h || priceChange24h,
				volume24h: poolMarketData?.volume_24h || 0,
				tvl: poolMarketData?.tvl || 0,
				high24h: poolMarketData?.high_24h || high24h,
				low24h: poolMarketData?.low_24h || (low24h === Infinity ? 0 : low24h),
				poolShare: aggregates.totalVolume ? ((poolMarketData?.volume_24h || 0) / aggregates.totalVolume * 100) : 0,
				fullyDilutedMarketCap
			};
		} else {
			// Token selected but no specific pool - show aggregated data for the token
			const supplyInfo = tokenSupplyData.find(s => s.tokenId === selectedToken.id);
			const tokenPools = marketData.filter(m => 
				m.pair.toUpperCase().includes(selectedToken.symbol.toUpperCase())
			);
			
			if (tokenPools.length === 0) return null;

			// Calculate volume-weighted price for this token across all its pools
			const totalVolume = tokenPools.reduce((sum, pool) => sum + (pool.volume_24h || 0), 0);
			const weightedPrice = totalVolume > 0 
				? tokenPools.reduce((sum, pool) => sum + ((pool.price || 0) * (pool.volume_24h || 0)), 0) / totalVolume
				: 0;

			const fullyDilutedMarketCap = supplyInfo ? weightedPrice * supplyInfo.totalSupply : null;

			return {
				price: weightedPrice,
				priceChange24h: 0, // Could calculate this but would be complex
				volume24h: totalVolume,
				tvl: tokenPools.reduce((sum, pool) => sum + (pool.tvl || 0), 0),
				fullyDilutedMarketCap,
				poolCount: tokenPools.length
			};
		}

		return null;
	})();

	// Format numbers
	function effectiveQuote(): string | null {
		if (!quoteSymbol) return null;
		const sym = quoteSymbol.toUpperCase();
		return sym === 'WVOI' ? 'VOI' : sym;
	}

	const formatPrice = (num: number | null | undefined): string => {
		if (num === null || num === undefined || num === 0) return '-';
		const eq = effectiveQuote();
		// If we are in USD mode and quote is USD, show $
		if (displayInUSD && eq === 'USD') {
			return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
		}
		// If not USD (or USD conversion not applied), show native quote symbol suffix
		return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}${eq ? ` ${eq}` : ''}`;
	};

	const formatCurrency = (num: number | null | undefined): string => {
		if (num === null || num === undefined || num === 0) return '-';
		const eq = effectiveQuote();
		if (displayInUSD && eq === 'USD') {
			return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
		}
		return `${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${eq ? ` ${eq}` : ''}`;
	};

	const formatPercentage = (num: number | null | undefined): string => {
		if (num === null || num === undefined || num === 0) return '0.00%';
		const formatted = num.toFixed(2);
		return num > 0 ? `+${formatted}%` : `${formatted}%`;
	};

	const formatNumber = (num: number | null | undefined, decimals: number = 0): string => {
		if (num === null || num === undefined || num === 0) return '-';
		return num.toLocaleString('en-US', { 
			minimumFractionDigits: decimals, 
			maximumFractionDigits: decimals 
		});
	};
</script>

{#if tokenMetrics && selectedToken}
	<div class="bg-white dark:bg-gray-800 shadow-md rounded-xl p-6 mb-6 w-full">
		<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 w-full">
			<!-- Price -->
			<div class="text-center">
				<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
					Price
				</div>
				<div class="text-lg font-bold text-gray-900 dark:text-white">
					{formatPrice(tokenMetrics.price)}
				</div>
			</div>

			<!-- 24h Change -->
			<div class="text-center">
				<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
					24h Change
				</div>
				<div class="text-lg font-bold {
					tokenMetrics.priceChange24h > 0 
						? 'text-green-600 dark:text-green-400' 
						: tokenMetrics.priceChange24h < 0 
							? 'text-red-600 dark:text-red-400' 
							: 'text-gray-900 dark:text-white'
				}">
					{formatPercentage(tokenMetrics.priceChange24h)}
				</div>
			</div>

			<!-- 24h Volume -->
			<div class="text-center">
				<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
					24h Volume
				</div>
				<div class="text-lg font-bold text-gray-900 dark:text-white">
					{formatCurrency(tokenMetrics.volume24h)}
				</div>
			</div>

			<!-- Market Cap / TVL -->
			{#if selectedToken.symbol.toUpperCase() === 'VOI' && !selectedPool}
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						Market Cap
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatCurrency(tokenMetrics.marketCap)}
					</div>
				</div>
			{:else if tokenMetrics.fullyDilutedMarketCap}
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						FD Market Cap
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatCurrency(tokenMetrics.fullyDilutedMarketCap)}
					</div>
				</div>
			{:else}
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						TVL
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatCurrency(tokenMetrics.tvl)}
					</div>
				</div>
			{/if}

			<!-- Pool-specific metrics -->
			{#if selectedPool}
				<!-- 24h High -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						24h High
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatPrice(tokenMetrics.high24h)}
					</div>
				</div>

				<!-- 24h Low -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						24h Low
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatPrice(tokenMetrics.low24h)}
					</div>
				</div>

				<!-- Pool Share -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						Pool Share
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatPercentage(tokenMetrics.poolShare)}
					</div>
				</div>
			{:else if selectedToken.symbol.toUpperCase() === 'VOI'}
				<!-- VOI-specific metrics -->
				<!-- Total TVL -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						Total TVL
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatCurrency(tokenMetrics.tvl)}
					</div>
				</div>

				<!-- Pool Count -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						Active Pools
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatNumber(tokenMetrics.poolCount)}
					</div>
				</div>

				<!-- Dominant Pair -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						Top Pair
					</div>
					<div class="text-sm font-bold text-gray-900 dark:text-white">
						{tokenMetrics.dominantPair}
					</div>
				</div>
			{/if}

			<!-- Additional metric for large screens -->
			{#if selectedToken.symbol.toUpperCase() === 'VOI' && !selectedPool}
				<div class="text-center hidden xl:block">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						FD Market Cap
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatCurrency(tokenMetrics.fullyDilutedMarketCap)}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
