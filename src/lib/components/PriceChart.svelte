<!-- PriceChart.svelte -->
<script lang="ts">
	import { onThemeChange } from '$lib/theme.svelte';
	import { onMount } from 'svelte';
	import Tabs from '$lib/ds/Tabs/Tabs.svelte';
	import { chartThemeOptions, resolveChartTokens } from '$lib/markets/chartTheme';
	import { createChartLifecycle } from '$lib/utils/chartLifecycle';
	import { createChart, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';

	export let data: LineData[] = [];
	export let height = 400;
	export let selectedMarket: {
		exchange: string;
		pair: string;
		trading_pair_id: number;
	} | null = null;

	let chartContainer: HTMLElement;
	let chart: IChartApi | undefined;
	let series: ISeriesApi<'Line'> | undefined;
	const lifecycle = createChartLifecycle();

	// Time period selection
	export let selectedPeriod: '24h' | '7d';
	export let onPeriodChange: (period: '24h' | '7d') => void;

	const periods = [
		{ value: '24h', label: '24H' },
		{ value: '7d', label: '7D' }
	];

	function formatTimeByPeriod(timestamp: number, period: '24h' | '7d'): string {
		const date = new Date(timestamp * 1000);
		const now = new Date();
		const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

		if (period === '24h') {
			// For 24h view, show HH:MM
			return date.toLocaleTimeString(undefined, {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			});
		} else {
			// For 7d view, show MMM DD HH:MM
			if (hoursDiff < 24) {
				return date.toLocaleTimeString(undefined, {
					hour: '2-digit',
					minute: '2-digit',
					hour12: false
				});
			} else {
				return date.toLocaleString(undefined, {
					month: 'short',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit',
					hour12: false
				});
			}
		}
	}

	function updateChartTheme() {
		if (!chart || !chartContainer) return;
		const options = chartThemeOptions(resolveChartTokens(getComputedStyle(chartContainer)));
		chart.applyOptions(options.chart);
		series?.applyOptions(options.line);
	}

	function initializeChart() {
		if (lifecycle.disposed || chart || !chartContainer) return;
		const { clientWidth: width, clientHeight: plotHeight } = chartContainer;
		if (!width || !plotHeight) return;
		const options = chartThemeOptions(resolveChartTokens(getComputedStyle(chartContainer)));
		chart = createChart(chartContainer, {
			...options.chart,
			width,
			height: plotHeight,
			rightPriceScale: {
				...options.chart.rightPriceScale,
				scaleMargins: { top: 0.2, bottom: 0.2 },
				mode: 1
			},
			timeScale: {
				...options.chart.timeScale,
				timeVisible: true,
				secondsVisible: false,
				tickMarkFormatter: (time: number) => formatTimeByPeriod(time, selectedPeriod)
			},
			localization: {
				timeFormatter: (time: number) => new Date(time * 1000).toLocaleString()
			},
			crosshair: { ...options.chart.crosshair, mode: 1 }
		});
		const instance = chart;
		lifecycle.add(() => {
			instance.remove();
			chart = undefined;
			series = undefined;
		});
		series = chart.addLineSeries({
			...options.line,
			lineWidth: 2,
			crosshairMarkerVisible: true,
			lastValueVisible: true,
			priceLineVisible: true,
			priceFormat: { type: 'price', precision: 6, minMove: 0.000001 }
		});
		if (data.length) {
			series.setData(data);
			chart.timeScale().fitContent();
		}
	}

	onMount(() => {
		const resizeObserver = new ResizeObserver(() => {
			initializeChart();
			if (chart && chartContainer.clientWidth && chartContainer.clientHeight) {
				chart.resize(chartContainer.clientWidth, chartContainer.clientHeight);
			}
		});
		lifecycle.add(() => resizeObserver.disconnect());
		resizeObserver.observe(chartContainer);
		lifecycle.add(onThemeChange(updateChartTheme));
		initializeChart();
		document.fonts?.ready.then(() => {
			if (!lifecycle.disposed) updateChartTheme();
		});
		return lifecycle.dispose;
	});

	$: if (series && data) {
		series.setData(data);
		if (chart) {
			chart.timeScale().fitContent();
		}
	}
</script>

<div class="flex w-full flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h3 class="text-h2 text-ink">
			Price Chart
			{#if selectedMarket}
				- {selectedMarket.exchange} {selectedMarket.pair}
			{:else}
				- All Markets Aggregated
			{/if}
		</h3>
		<div class="flex max-w-full flex-col gap-1">
			<span class="text-label text-ink-muted">Period</span>
			<Tabs
				variant="segmented"
				label="Period"
				options={periods}
				value={selectedPeriod}
				onchange={(value) => onPeriodChange(value as '24h' | '7d')}
			/>
		</div>
	</div>
	<div class="plot w-full" style:--plot-height={`${height}px`} bind:this={chartContainer}></div>
</div>

<style>
	.plot {
		height: var(--plot-height, 400px);
	}
	@media (max-width: 639px) {
		.plot {
			height: 280px;
		}
	}
</style>
