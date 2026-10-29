<script lang="ts">
	import { Spinner } from 'flowbite-svelte';
	import type { Snippet } from 'svelte';
	import OHLCVChart from '$lib/components/OHLCVChart.svelte';
	import type { UniqueToken } from '../../api/tokens/+server';
	import type { OHLCVData, VolumeData, ChartSettings, Resolution } from '$lib/types/ohlcv.types';

	interface Props {
		showTokenChart: boolean;
		selectedToken: UniqueToken | null;
		tokenChartLoading: boolean;
		tokenChartError: string;
		tokenChartData: OHLCVData[];
		tokenChartVolumes: VolumeData[];
		currentQuoteCurrency: 'VOI' | 'USD';
		chartSettings: ChartSettings;
		handleChartResolutionChange: (resolution: Resolution) => void;
		handleChartTypeChange: (chartType: 'candlestick' | 'line') => void;
		fetchVOIChartData: (resolution: Resolution, quoteCurrency: 'VOI' | 'USD') => Promise<void>;
		fetchTokenChartData: (
			tokenId: number,
			resolution: Resolution,
			quoteCurrency: 'VOI' | 'USD'
		) => Promise<void>;
		children: Snippet;
	}

	let {
		showTokenChart,
		selectedToken,
		tokenChartLoading,
		tokenChartError,
		tokenChartData,
		tokenChartVolumes,
		currentQuoteCurrency = $bindable(),
		chartSettings,
		handleChartResolutionChange,
		handleChartTypeChange,
		fetchVOIChartData,
		fetchTokenChartData,
		children
	}: Props = $props();
</script>

<div
	class="lg:col-span-2 {showTokenChart && selectedToken
		? 'p-0'
		: 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4'} overflow-hidden flex flex-col"
	style="height: 640px;"
>
	{#if showTokenChart && selectedToken}
		{#if tokenChartLoading}
			<div
				class="flex items-center justify-center h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
			>
				<Spinner size="8" />
				<span class="ml-2 text-gray-600 dark:text-gray-400">Loading chart...</span>
			</div>
		{:else if tokenChartError}
			<div
				class="flex items-center justify-center h-full text-center bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
			>
				<div>
					<i class="fas fa-exclamation-triangle text-2xl text-yellow-500 mb-2"></i>
					<p class="text-gray-600 dark:text-gray-400">{tokenChartError}</p>
				</div>
			</div>
		{:else if tokenChartData.length > 0}
			<div class="flex-1 min-h-0">
				<OHLCVChart
					tokenPair={selectedToken.id === 0
						? {
								baseTokenId: 0,
								quoteTokenId: 302190, // aUSDC
								baseSymbol: 'VOI',
								quoteSymbol: currentQuoteCurrency === 'USD' ? 'USD' : 'aUSDC',
								baseDecimals: 6,
								quoteDecimals: 6,
								poolId: undefined
							}
						: {
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
					bind:quoteCurrency={currentQuoteCurrency}
					on:refreshData
					on:resolutionChange={(e) => handleChartResolutionChange(e.detail)}
					on:chartTypeChange={(e) => handleChartTypeChange(e.detail)}
					on:quoteChange={(e) => {
						console.log('quoteChange event received in markets page:', e.detail);
						currentQuoteCurrency = e.detail;
						console.log('currentQuoteCurrency updated to:', currentQuoteCurrency);
						if (selectedToken!.id === 0) {
							fetchVOIChartData(chartSettings.resolution, currentQuoteCurrency);
						} else {
							fetchTokenChartData(
								selectedToken!.id,
								chartSettings.resolution,
								currentQuoteCurrency
							);
						}
					}}
				/>
			</div>
		{/if}
	{:else}
		<!-- Default Price Chart for VOI or when no token selected -->
		<div class="flex-1 min-h-0">
			{@render children()}
		</div>
	{/if}
</div>
