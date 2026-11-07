<script lang="ts">
	import Card from '$lib/ds/Card/Card.svelte';
	import InlineAlert from '$lib/ds/InlineAlert/InlineAlert.svelte';
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

<Card>
	{#if tokenChartError}
		<InlineAlert message={tokenChartError} />
	{/if}
	{#if showTokenChart && selectedToken}
		{#if tokenChartLoading}
			<p role="status" class="py-4 text-ink-muted">Loading chart...</p>
		{:else if tokenChartError}
			<!-- The alert above also remains visible when the fetch selects the fallback. -->
		{:else if tokenChartData.length > 0}
			<div class="min-w-0">
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
		{:else}
			<p class="py-4 text-ink-muted">No chart data available.</p>
		{/if}
	{:else if tokenChartLoading && selectedToken}
		<p role="status" class="py-4 text-ink-muted">Loading chart...</p>
	{:else}
		<p class="mb-3 text-label text-ink-muted">Fallback price chart</p>
		<div class="min-w-0">
			{@render children()}
		</div>
	{/if}
</Card>
