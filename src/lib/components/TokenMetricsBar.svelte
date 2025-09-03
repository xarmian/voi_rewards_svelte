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

	// Token analytics data from our new API
	let tokenAnalytics: any = null;
	let poolAnalytics: any = null;
	let analyticsLoading = false;

	// Token supply data (legacy - now included in token analytics)
	let tokenSupplyData: { tokenId: number; totalSupply: number }[] = [];

	// Fetch token analytics when token changes
	$: if (selectedToken) {
		fetchTokenAnalytics(selectedToken.id);
	}

	// Fetch pool analytics when pool changes
	$: if (selectedPool) {
		fetchPoolAnalytics(selectedPool.poolId);
	} else {
		poolAnalytics = null;
	}

	// Fetch token analytics from new API
	async function fetchTokenAnalytics(tokenId: number) {
		analyticsLoading = true;
		try {
			const response = await fetch(`/api/token-analytics?tokenId=${tokenId}`);
			const data = await response.json();
			if (data.success) {
				tokenAnalytics = data.analytics;
				console.log('Token analytics loaded:', tokenAnalytics);
			} else {
				console.error('Token analytics API error:', data.error);
				tokenAnalytics = null;
			}
		} catch (error) {
			console.error('Failed to fetch token analytics:', error);
			tokenAnalytics = null;
		} finally {
			analyticsLoading = false;
		}
	}

	// Fetch pool analytics from new API
	async function fetchPoolAnalytics(poolId: number) {
		if (!poolId) return;
		try {
			const response = await fetch(`/api/pool-analytics?poolId=${poolId}`);
			const data = await response.json();
			if (data.success) {
				poolAnalytics = data.analytics;
				console.log('Pool analytics loaded:', poolAnalytics);
			} else {
				console.error('Pool analytics API error:', data.error);
				poolAnalytics = null;
			}
		} catch (error) {
			console.error('Failed to fetch pool analytics:', error);
			poolAnalytics = null;
		}
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
				.filter((m) => m.price_change_percentage_24h != null)
				.map((m) => m.price_change_percentage_24h);
			const avgPriceChange =
				priceChanges.length > 0
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
				dominantPair:
					marketData.sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0))[0]?.pair || 'N/A'
			};
		} else if (selectedPool) {
			// Pool-specific metrics using new pool analytics API
			const poolMarketData = marketData.find((m) => m.trading_pair_id === selectedPool.poolId);

			// Get latest OHLCV data and derive a 24h window relative to the latest bar
			const latestCandle = ohlcvData[ohlcvData.length - 1];
			const nowTs = latestCandle?.time ?? 0;
			const windowStart = nowTs - 24 * 60 * 60; // last 24 hours
			const last24h = ohlcvData.filter((c) => c.time >= windowStart);
			// Fallback to full data if filter yields nothing
			const seriesForWindow = last24h.length > 0 ? last24h : ohlcvData;
			const firstInWindow = seriesForWindow[0];
			const priceChange24h =
				latestCandle && firstInWindow
					? ((latestCandle.close - firstInWindow.open) / firstInWindow.open) * 100
					: 0;
			// Calculate 24h high/low only within the window
			const high24h = seriesForWindow.reduce((max, candle) => Math.max(max, candle.high), 0);
			const low24h = seriesForWindow.reduce((min, candle) => Math.min(min, candle.low), Infinity);

			// Use pool analytics data when available, fallback to legacy logic
			const currentPrice = latestCandle?.close || poolMarketData?.price || 0;
			const volume24h = poolAnalytics?.volume?.volume24h || poolMarketData?.volume_24h || 0;
			const poolTvl = poolAnalytics?.liquidity?.totalTvlUsd || poolMarketData?.tvl || 0;

			// Calculate fully diluted market cap using token analytics if available
			const fullyDilutedMarketCap =
				tokenAnalytics?.tvl?.totalTvl && currentPrice > 0
					? currentPrice * (tokenAnalytics.volume?.volume24h || 0) // This would need price data, simplified for now
					: null;

			console.log('Pool metrics calculation:', {
				selectedPoolId: selectedPool.poolId,
				poolAnalytics,
				volume24h,
				poolTvl
			});

			return {
				price: currentPrice,
				priceChange24h: poolMarketData?.price_change_percentage_24h || priceChange24h,
				volume24h,
				tvl: poolTvl,
				high24h: poolMarketData?.high_24h || high24h,
				low24h: poolMarketData?.low_24h || (low24h === Infinity ? 0 : low24h),
				poolShare:
					aggregates.totalVolume && volume24h > 0 ? (volume24h / aggregates.totalVolume) * 100 : 0,
				fullyDilutedMarketCap,
				// Add pool-specific metrics from analytics
				swapCount24h: poolAnalytics?.metrics?.swapCount24h || 0,
				uniqueTraders24h: poolAnalytics?.metrics?.uniqueTraders24h || 0,
				volume7d: poolAnalytics?.volume?.volume7d || 0
			};
		} else {
			// Token selected but no specific pool - show aggregated data using token analytics
			const tokenPools = marketData.filter((m) =>
				m.pair.toUpperCase().includes(selectedToken.symbol.toUpperCase())
			);

			// Use token analytics data when available, fallback to legacy logic
			const volume24h =
				tokenAnalytics?.volume?.volume24h ||
				tokenPools.reduce((sum, pool) => sum + (pool.volume_24h || 0), 0);
			const totalTvl =
				tokenAnalytics?.tvl?.totalTvl || tokenPools.reduce((sum, pool) => sum + (pool.tvl || 0), 0);

			// Calculate volume-weighted price for this token across all its pools
			const totalMarketVolume = tokenPools.reduce((sum, pool) => sum + (pool.volume_24h || 0), 0);
			const weightedPrice =
				totalMarketVolume > 0
					? tokenPools.reduce((sum, pool) => sum + (pool.price || 0) * (pool.volume_24h || 0), 0) /
						totalMarketVolume
					: 0;

			// Use total supply from token analytics if available
			const totalSupply =
				tokenAnalytics?.totalSupply ||
				tokenSupplyData.find((s) => s.tokenId === selectedToken.id)?.totalSupply;
			const fullyDilutedMarketCap =
				totalSupply && weightedPrice > 0 ? weightedPrice * totalSupply : null;

			console.log('Token aggregated metrics:', {
				selectedTokenId: selectedToken.id,
				tokenAnalytics,
				volume24h,
				totalTvl,
				totalSupply
			});

			return {
				price: weightedPrice,
				priceChange24h: 0, // Could calculate this but would be complex
				volume24h,
				volume7d: tokenAnalytics?.volume?.volume7d || 0,
				volume30d: tokenAnalytics?.volume?.volume30d || 0,
				tvl: totalTvl,
				fullyDilutedMarketCap,
				poolCount: tokenAnalytics?.tvl?.poolCount || tokenPools.length
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
		<div
			class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 w-full"
		>
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
				<div
					class="text-lg font-bold {tokenMetrics.priceChange24h > 0
						? 'text-green-600 dark:text-green-400'
						: tokenMetrics.priceChange24h < 0
							? 'text-red-600 dark:text-red-400'
							: 'text-gray-900 dark:text-white'}"
				>
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

				<!-- 24h Swaps (if available) -->
				{#if tokenMetrics.swapCount24h !== undefined}
					<div class="text-center">
						<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
							24h Swaps
						</div>
						<div class="text-lg font-bold text-gray-900 dark:text-white">
							{formatNumber(tokenMetrics.swapCount24h)}
						</div>
					</div>
				{/if}

				<!-- Unique Traders (if available) -->
				{#if tokenMetrics.uniqueTraders24h !== undefined}
					<div class="text-center">
						<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
							Unique Traders
						</div>
						<div class="text-lg font-bold text-gray-900 dark:text-white">
							{formatNumber(tokenMetrics.uniqueTraders24h)}
						</div>
					</div>
				{/if}
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
			{:else}
				<!-- Non-VOI token metrics -->
				<!-- 7d Volume (if available) -->
				{#if tokenMetrics.volume7d !== undefined && tokenMetrics.volume7d > 0}
					<div class="text-center">
						<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
							7d Volume
						</div>
						<div class="text-lg font-bold text-gray-900 dark:text-white">
							{formatCurrency(tokenMetrics.volume7d)}
						</div>
					</div>
				{/if}

				<!-- 30d Volume (if available) -->
				{#if tokenMetrics.volume30d !== undefined && tokenMetrics.volume30d > 0}
					<div class="text-center">
						<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
							30d Volume
						</div>
						<div class="text-lg font-bold text-gray-900 dark:text-white">
							{formatCurrency(tokenMetrics.volume30d)}
						</div>
					</div>
				{/if}
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
