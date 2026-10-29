<script lang="ts">
	import { fade } from 'svelte/transition';
	import { formatCurrency, formatNumber } from '$lib/markets/format';
	import type { UniqueToken } from '../../api/tokens/+server';
	import type { PageData } from './$types';

	interface Props {
		selectedToken: UniqueToken | null;
		fetchingMarketData: boolean;
		totalVolume24h: number | null;
		totalTvlAll: number | null;
		circulatingMarketCap: number;
		tokenTotalSupplyAdjusted: number | null;
		fullyDilutedMarketCap: number;
		realCirculatingSupply: NonNullable<PageData['circulatingSupply']>;
		activeMarketsCount: number | null;
		realMarketData: { exchange: string }[];
	}

	let {
		selectedToken,
		fetchingMarketData,
		totalVolume24h,
		totalTvlAll,
		circulatingMarketCap,
		tokenTotalSupplyAdjusted,
		fullyDilutedMarketCap,
		realCirculatingSupply,
		activeMarketsCount,
		realMarketData
	}: Props = $props();
</script>

<!-- Key Metrics -->
<div class="grid grid-cols-2 md:grid-cols-4 gap-6 mb-4">
	<!-- Total Volume -->
	<div
		class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4"
		transition:fade={{ duration: 300, delay: 200 }}
	>
		<div class="flex items-center justify-between mb-2">
			<h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">24h Volume</h3>
			<i class="fas fa-chart-bar text-blue-500"></i>
		</div>
		<div class="text-2xl font-bold text-gray-900 dark:text-white">
			{#if fetchingMarketData}
				<div class="animate-pulse bg-gray-300 dark:bg-gray-600 rounded h-8 w-20"></div>
			{:else}
				{totalVolume24h === null ? '—' : formatCurrency(totalVolume24h)}
			{/if}
		</div>
	</div>

	<!-- Total TVL -->
	<div
		class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4"
		transition:fade={{ duration: 300, delay: 250 }}
	>
		<div class="flex items-center justify-between mb-2">
			<h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">Total TVL</h3>
			<i class="fas fa-lock text-green-500"></i>
		</div>
		<div class="text-2xl font-bold text-gray-900 dark:text-white">
			{#if fetchingMarketData}
				<div class="animate-pulse bg-gray-300 dark:bg-gray-600 rounded h-8 w-24"></div>
			{:else}
				{totalTvlAll === null ? '—' : formatCurrency(totalTvlAll)}
			{/if}
		</div>
	</div>

	<!-- Market Cap / FDV -->
	<div
		class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4"
		transition:fade={{ duration: 300, delay: 300 }}
	>
		<div class="flex items-center justify-between mb-2">
			<h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">
				{(selectedToken?.symbol || 'VOI') === 'VOI' ? 'Market Cap' : 'FDV'}
			</h3>
			<i class="fas fa-coins text-purple-500"></i>
		</div>
		<div class="text-2xl font-bold text-gray-900 dark:text-white">
			{#if fetchingMarketData}
				<div class="animate-pulse bg-gray-300 dark:bg-gray-600 rounded h-8 w-28"></div>
			{:else}
				{(selectedToken?.symbol || 'VOI') === 'VOI'
					? formatCurrency(circulatingMarketCap)
					: tokenTotalSupplyAdjusted != null
						? formatCurrency(fullyDilutedMarketCap)
						: '-'}
			{/if}
		</div>
		<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
			{#if (selectedToken?.symbol || 'VOI') === 'VOI'}
				Circulating: {formatNumber(realCirculatingSupply.circulatingSupply, 0)}
			{:else}
				Total Supply: {tokenTotalSupplyAdjusted != null
					? formatNumber(tokenTotalSupplyAdjusted, 0)
					: '—'}
			{/if}
		</div>
	</div>

	<!-- Active Markets -->
	<div
		class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4"
		transition:fade={{ duration: 300, delay: 350 }}
	>
		<div class="flex items-center justify-between mb-2">
			<h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">Active Markets</h3>
			<i class="fas fa-exchange-alt text-orange-500"></i>
		</div>
		<div class="text-2xl font-bold text-gray-900 dark:text-white">
			{#if fetchingMarketData}
				<div class="animate-pulse bg-gray-300 dark:bg-gray-600 rounded h-8 w-12"></div>
			{:else}
				{activeMarketsCount === null ? '—' : activeMarketsCount}
			{/if}
		</div>
		<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
			{#if fetchingMarketData}
				<div class="animate-pulse bg-gray-300 dark:bg-gray-600 rounded h-3 w-20"></div>
			{:else}
				Across {new Set(realMarketData.map((m) => m.exchange)).size} exchanges
			{/if}
		</div>
	</div>
</div>
