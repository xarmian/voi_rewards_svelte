<!-- PriceChart.svelte -->
<script lang="ts">
	import { onThemeChange } from '$lib/theme.svelte';
	import { onMount } from 'svelte';
	import { chartTimestamp, describeLine } from '$lib/markets/chartDescription';
	import {
		clearInspection,
		inspect,
		isInspectionKey,
		inspectionInstructions
	} from '$lib/markets/chartInspection';
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

	let inspection = clearInspection();
	$: selection = selectedMarket
		? `${selectedMarket.exchange} ${selectedMarket.pair}`
		: 'All Markets Aggregated';
	$: description = describeLine(data, selection, selectedPeriod);
	$: inspectedText =
		inspection.index === null ? '' : (description.observations[inspection.index] ?? '');
	$: {
		void data;
		void selectedMarket;
		void selectedPeriod;
		void description;
		clearChartInspection();
	}
	function clearChartInspection() {
		inspection = inspect(inspection, { reset: true }, description.observations);
	}
	function handleInspectionKey(event: KeyboardEvent) {
		if (!isInspectionKey(event.key)) return;
		event.preventDefault();
		inspection = inspect(inspection, { key: event.key }, description.observations);
	}
	function handleCrosshairMove(param: import('lightweight-charts').MouseEventParams) {
		const index =
			param.time === undefined
				? null
				: description.rows.findIndex((row) => row[0] === chartTimestamp(param.time!));
		inspection = inspect(inspection, { pointer: index }, description.observations);
	}

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
		chart.subscribeCrosshairMove(handleCrosshairMove);
		lifecycle.add(() => instance.unsubscribeCrosshairMove(handleCrosshairMove));
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

<section aria-labelledby="price-chart-title" class="flex min-w-0 w-full flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 id="price-chart-title" class="text-h2 text-ink">Price Chart - {selection}</h2>
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
	<p id="price-chart-description" class="text-label text-ink-muted">{description.summary}</p>
	<p id="price-chart-instructions" class="text-label text-ink-muted">{inspectionInstructions}</p>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		role="group"
		tabindex="0"
		aria-roledescription="chart"
		aria-labelledby="price-chart-title"
		aria-describedby="price-chart-description price-chart-instructions"
		class="chart-inspection rounded-ds-sm"
		onkeydown={handleInspectionKey}
	>
		<div class="plot w-full" style:--plot-height={`${height}px`} bind:this={chartContainer}></div>
	</div>
	<p class="text-label text-ink">{inspectedText}</p>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{inspection.announcement}</p>
	<details class="min-w-0 text-label">
		<summary class="w-fit cursor-pointer text-accent">View data</summary>
		<!-- A named data region is keyboard scrollable when its table overflows. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			role="region"
			aria-label="Price chart data"
			tabindex="0"
			class="chart-inspection mt-2 max-w-full overflow-x-auto rounded-ds-sm"
		>
			<table class="w-full text-label">
				<caption class="mb-2 text-start text-ink-muted">{description.caption}</caption>
				<thead
					><tr
						>{#each description.headers as header}<th
								scope="col"
								class="border-b border-line p-2 text-start">{header}</th
							>{/each}</tr
					></thead
				>
				<tbody
					>{#each description.rows as row}<tr
							>{#each row as cell}<td class="num whitespace-nowrap border-b border-line p-2"
									>{cell}</td
								>{/each}</tr
						>{/each}</tbody
				>
			</table>
		</div>
	</details>
</section>

<style>
	.chart-inspection:focus-visible {
		outline: 2px solid rgb(var(--c-focus));
		outline-offset: 2px;
	}
	.plot {
		height: var(--plot-height, 400px);
	}
	@media (max-width: 639px) {
		.plot {
			height: 280px;
		}
	}
</style>
