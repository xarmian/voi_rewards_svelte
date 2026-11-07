<script lang="ts">
	import { onThemeChange } from '$lib/theme.svelte';
	import { onMount, createEventDispatcher } from 'svelte';
	import { chartTimestamp, describeOHLCV, displayedByTime } from '$lib/markets/chartDescription';
	import {
		clearInspection,
		inspect,
		isInspectionKey,
		inspectionInstructions
	} from '$lib/markets/chartInspection';
	import { createChartLifecycle } from '$lib/utils/chartLifecycle';
	import Button from '$lib/ds/Button/Button.svelte';
	import Tabs from '$lib/ds/Tabs/Tabs.svelte';
	import {
		chartThemeOptions,
		resolveChartTokens,
		themedCandles,
		themedVolumes,
		type ChartTokens
	} from '$lib/markets/chartTheme';
	import {
		createChart,
		type IChartApi,
		type ISeriesApi,
		type CandlestickData,
		type LineData
	} from 'lightweight-charts';
	import type {
		OHLCVData,
		VolumeData,
		Resolution,
		TokenPair,
		ChartSettings
	} from '$lib/types/ohlcv.types';

	const dispatch = createEventDispatcher<{
		refreshData: { tokenPair: TokenPair; resolution: Resolution };
		resolutionChange: Resolution;
		chartTypeChange: 'candlestick' | 'line';
		quoteChange: 'VOI' | 'USD';
	}>();

	export let tokenPair: TokenPair;
	export let data: OHLCVData[] = [];
	export let volumes: VolumeData[] = [];
	export let loading = false;
	export let height = 400;
	export let settings: ChartSettings = {
		chartType: 'candlestick',
		resolution: '1h',
		autoRefresh: false,
		refreshInterval: 5,
		showVolume: true,
		theme: 'light'
	};
	export let quoteCurrency: 'VOI' | 'USD' = 'USD';

	let chartContainer: HTMLElement;
	let chart: IChartApi | undefined;
	const lifecycle = createChartLifecycle();
	let mainSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | undefined;
	let volumeSeries: ISeriesApi<'Histogram'> | undefined;
	let renderedCandles: CandlestickData[] = [];
	let chartTokens: ChartTokens;
	let prevPairKey: string | null = null;
	let isInitializing = false;
	let inspection = clearInspection();
	$: displayedData = displayedByTime(data);
	$: displayedVolumes = displayedByTime(volumes);
	$: visibleVolumes = settings.showVolume && displayedData.length > 0 ? displayedVolumes : [];
	$: quote =
		tokenPair.quoteSymbol === 'aUSDC' && quoteCurrency === 'USD'
			? 'USD'
			: tokenPair.quoteSymbol || quoteCurrency;
	$: description = describeOHLCV(displayedData, visibleVolumes, {
		selection: `${tokenPair.baseSymbol}/${quote}`,
		period: settings.resolution,
		quote
	});
	$: inspectedText =
		inspection.index === null ? '' : (description.observations[inspection.index] ?? '');
	$: {
		void data;
		void volumes;
		void tokenPair;
		void settings.resolution;
		void settings.showVolume;
		void chartType;
		void quoteCurrency;
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

	// Local chart type state to avoid mutating parent prop object
	let chartType: 'candlestick' | 'line' = settings.chartType;
	let chartTypeInitialized = false;
	// Initialize local chartType once from incoming settings on first run
	$: if (!chartTypeInitialized && settings?.chartType) {
		chartType = settings.chartType;
		chartTypeInitialized = true;
	}

	function formatTimeByResolution(ts: number, resolution: Resolution): string {
		const d = new Date(ts * 1000);
		if (resolution === '1d' || resolution === '4h') {
			return d.toLocaleString(undefined, {
				month: 'short',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			});
		}
		return d.toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
	}

	function toUnixSeconds(t: any): number {
		if (typeof t === 'number') return t;
		if (t && typeof t === 'object' && 'year' in t && 'month' in t && 'day' in t) {
			const { year, month, day } = t as { year: number; month: number; day: number };
			return Math.floor(new Date(year, month - 1, day).getTime() / 1000);
		}
		const dt = new Date(t as any);
		return Math.floor(dt.getTime() / 1000) || 0;
	}

	function applyTimeFormatter() {
		if (!chart) return;
		chart.applyOptions({
			timeScale: {
				tickMarkFormatter: (time: any) => {
					const ts = toUnixSeconds(time);
					return formatTimeByResolution(ts, settings.resolution);
				}
			},
			localization: {
				timeFormatter: (time: any) => {
					const ts = toUnixSeconds(time);
					return formatTimeByResolution(ts, settings.resolution);
				}
			}
		});
	}

	const resolutions: { value: Resolution; label: string }[] = [
		{ value: '1m', label: '1 minute' },
		{ value: '5m', label: '5 minutes' },
		{ value: '15m', label: '15 minutes' },
		{ value: '1h', label: '1 hour' },
		{ value: '4h', label: '4 hours' },
		{ value: '1d', label: '1 day' }
	];

	function updateChartTheme() {
		if (!chart || !chartContainer) return;
		chartTokens = resolveChartTokens(getComputedStyle(chartContainer));
		const options = chartThemeOptions(chartTokens);
		chart.applyOptions(options.chart);
		mainSeries?.applyOptions(chartType === 'candlestick' ? options.candles : options.line);
		volumeSeries?.applyOptions(options.volume);
		// Candlestick point overrides include neutral candles. Recolor only renderer copies;
		// setData retains the existing time scale, and this path never fits the range.
		if (chartType === 'candlestick' && mainSeries && renderedCandles.length) {
			renderedCandles = themedCandles(
				renderedCandles.map((point) => ({ ...point, time: toUnixSeconds(point.time) })),
				chartTokens
			);
			// Keep the user's zoom and pan across the recolor, whatever setData does to the range.
			const range = chart.timeScale().getVisibleLogicalRange();
			(mainSeries as ISeriesApi<'Candlestick'>).setData(renderedCandles);
			if (range) chart.timeScale().setVisibleLogicalRange(range);
		}
	}

	function initializeChart() {
		if (lifecycle.disposed) return;
		if (!chartContainer) {
			console.error('Chart container not found');
			return;
		}

		if (isInitializing || chart) {
			return;
		}

		if (!chartContainer.clientWidth || !chartContainer.clientHeight) return;

		isInitializing = true;
		chartTokens = resolveChartTokens(getComputedStyle(chartContainer));
		const options = chartThemeOptions(chartTokens);
		chart = createChart(chartContainer, {
			...options.chart,
			height: chartContainer.clientHeight,
			width: chartContainer.clientWidth,
			rightPriceScale: {
				...options.chart.rightPriceScale,
				scaleMargins: { top: 0.1, bottom: settings.showVolume ? 0.4 : 0.1 }
			},
			timeScale: {
				...options.chart.timeScale,
				timeVisible: true,
				secondsVisible: false,
				tickMarkFormatter: (time: number) => {
					const ts = typeof time === 'number' ? time : (time as unknown as number);
					return formatTimeByResolution(ts, settings.resolution);
				}
			},
			crosshair: { ...options.chart.crosshair, mode: 1 }
		});

		const instance = chart;
		lifecycle.add(() => {
			instance.remove();
			chart = undefined;
			mainSeries = undefined;
			volumeSeries = undefined;
		});

		createMainSeries();

		if (settings.showVolume) {
			createVolumeSeries();
		}

		updateChartTheme();
		applyTimeFormatter();

		// Pointer and keyboard inspection select the same displayed observation text.
		const handleCrosshairMove = (param: import('lightweight-charts').MouseEventParams) => {
			const time = param.time === undefined ? undefined : toUnixSeconds(param.time);
			const index =
				time === undefined
					? null
					: description.rows.findIndex((row) => row[0] === chartTimestamp(time));
			inspection = inspect(inspection, { pointer: index }, description.observations);
		};
		chart.subscribeCrosshairMove(handleCrosshairMove);
		lifecycle.add(() => instance.unsubscribeCrosshairMove(handleCrosshairMove));

		// Update data if available
		if (data.length > 0) {
			updateChartData();
		}

		isInitializing = false;
	}

	function createMainSeries() {
		if (!chart) return;

		// Remove existing main series (guard against stale handles)
		try {
			if (mainSeries) {
				chart.removeSeries(mainSeries);
			}
		} catch (e) {
			console.warn('Failed to remove existing series (likely stale handle), recreating:', e);
		}

		if (chartType === 'candlestick') {
			mainSeries = chart.addCandlestickSeries({
				priceScaleId: 'right',
				...chartThemeOptions(chartTokens).candles
			});
		} else {
			mainSeries = chart.addLineSeries({
				priceScaleId: 'right',
				...chartThemeOptions(chartTokens).line,
				lineWidth: 2,
				crosshairMarkerVisible: true,
				lastValueVisible: true,
				priceLineVisible: true
			});
		}

		// Configure price format based on token pair and clamp autoscale to non-negative
		const precision = Math.max(tokenPair.quoteDecimals - tokenPair.baseDecimals + 2, 2);
		(mainSeries as any).applyOptions({
			priceFormat: {
				type: 'price',
				precision: Math.min(precision, 8),
				minMove: Math.pow(10, -precision)
			},
			autoscaleInfoProvider: (original: () => any) => {
				const info = typeof original === 'function' ? original() : null;
				if (!info || !info.priceRange) return info;
				const pr = info.priceRange;
				return {
					priceRange: {
						minValue: Math.max(0, pr.minValue ?? 0),
						maxValue: pr.maxValue
					},
					margins: info.margins
				};
			}
		});
	}

	function createVolumeSeries() {
		if (!chart || volumeSeries) return;

		volumeSeries = chart.addHistogramSeries({
			...chartThemeOptions(chartTokens).volume,
			priceFormat: {
				type: 'volume'
			},
			priceScaleId: 'volume'
		});

		chart.priceScale('volume').applyOptions({
			scaleMargins: {
				top: 0.7,
				bottom: 0
			}
		});
	}

	function updateChartData() {
		if (!chart || !mainSeries || !data.length) {
			return;
		}

		const sortedData = displayedData;
		// Dynamically adjust price precision based on value range
		try {
			const lows = sortedData.map((d) => (Number.isFinite(d.low) ? d.low : d.close));
			const highs = sortedData.map((d) => (Number.isFinite(d.high) ? d.high : d.close));
			const minVal = Math.min(...lows);
			const maxVal = Math.max(...highs);
			let dynamicPrecision = 2;
			if (maxVal < 1) dynamicPrecision = 6;
			else if (maxVal < 10) dynamicPrecision = 4;
			// Apply dynamic precision to the series price format
			mainSeries.applyOptions({
				priceFormat: {
					type: 'price',
					precision: Math.min(Math.max(dynamicPrecision, 2), 8),
					minMove: Math.pow(10, -Math.min(Math.max(dynamicPrecision, 2), 8))
				}
			});
		} catch (e) {
			console.warn('Failed to set dynamic precision:', e);
		}

		if (chartType === 'candlestick') {
			renderedCandles = themedCandles(sortedData, chartTokens);
			(mainSeries as ISeriesApi<'Candlestick'>).setData(renderedCandles);
		} else {
			const lineData: LineData[] = sortedData.map((item) => ({
				time: item.time,
				value: item.close
			}));
			(mainSeries as ISeriesApi<'Line'>).setData(lineData);
		}

		// Handle volume series presence and bottom whitespace
		if (settings.showVolume) {
			if (volumes.length > 0) {
				if (!volumeSeries) {
					createVolumeSeries();
				}
				volumeSeries?.setData(themedVolumes(displayedVolumes));
				chart.priceScale('right').applyOptions({
					scaleMargins: { top: 0.1, bottom: 0.4 }
				});
			} else {
				if (volumeSeries) {
					chart.removeSeries(volumeSeries);
					volumeSeries = undefined;
				}
				chart.priceScale('right').applyOptions({
					scaleMargins: { top: 0.1, bottom: 0.1 }
				});
			}
		}

		// Fit to data without jumping past the last bar
		if (chart) {
			chart.timeScale().fitContent();
		}
	}

	function handleResolutionChange(resolution: Resolution) {
		// Notify parent; parent will update settings.resolution and we'll re-apply formatter then
		dispatch('resolutionChange', resolution);
	}

	function handleChartTypeChange(nextType: 'candlestick' | 'line') {
		// Update local state (do not mutate parent settings object directly)
		chartType = nextType;
		createMainSeries();
		updateChartData();
		dispatch('chartTypeChange', nextType);
	}

	function handleRefresh() {
		dispatch('refreshData', { tokenPair, resolution: settings.resolution });
	}

	function toggleVolume() {
		settings.showVolume = !settings.showVolume;
		if (!chart) return;

		if (settings.showVolume) {
			createVolumeSeries();
			updateChartData();
		} else if (volumeSeries) {
			chart.removeSeries(volumeSeries);
			volumeSeries = undefined;
		}

		// Update price scale margins
		chart.priceScale('right').applyOptions({
			scaleMargins: {
				top: 0.1,
				bottom: settings.showVolume ? 0.4 : 0.1
			}
		});
	}

	function toggleQuoteCurrency() {
		quoteCurrency = quoteCurrency === 'VOI' ? 'USD' : 'VOI';
		dispatch('quoteChange', quoteCurrency);
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

	// Reactive updates: update chart whenever new data arrives or resolution changes
	let prevSig = '';
	$: {
		const sig = JSON.stringify([
			displayedData,
			displayedVolumes,
			settings.resolution,
			chartType,
			settings.showVolume
		]);
		if (sig !== prevSig) {
			prevSig = sig;
			if (chart && mainSeries) {
				if (data && data.length > 0) {
					updateChartData();
				} else {
					// Clear series when no data and reset scales/volume
					renderedCandles = [];
					if (chartType === 'candlestick') {
						(mainSeries as ISeriesApi<'Candlestick'>).setData([]);
					} else {
						(mainSeries as ISeriesApi<'Line'>).setData([]);
					}
					if (volumeSeries) {
						chart.removeSeries(volumeSeries);
						volumeSeries = undefined;
					}
					chart.priceScale('right').applyOptions({
						scaleMargins: { top: 0.1, bottom: 0.1 }
					});
				}
			}
		}
	}

	// Recreate series when token pair changes (ids or symbols affect price formatting)
	let prevPairSymbols = '';
	$: if (chart && tokenPair) {
		const pairKey = `${tokenPair.baseTokenId}-${tokenPair.quoteTokenId}`;
		const symbolKey = `${tokenPair.baseSymbol}/${tokenPair.quoteSymbol}`;
		if (prevPairKey !== pairKey || prevPairSymbols !== symbolKey) {
			prevPairKey = pairKey;
			prevPairSymbols = symbolKey;
			// When the token pair changes, adopt parent's desired chartType
			if (settings?.chartType && settings.chartType !== chartType) {
				chartType = settings.chartType;
			}
			createMainSeries();
			if (data.length > 0) {
				updateChartData();
			}
		}
	}

	// Note: chart initializes once on mount; do not reinitialize reactively

	let prevChartType: 'candlestick' | 'line' = chartType;
	let prevResolution = settings.resolution;
	$: if (chart && chartType !== prevChartType) {
		prevChartType = chartType;
		createMainSeries();
		if (data.length > 0) {
			updateChartData();
		}
	}

	// Note: We intentionally avoid syncing chartType from settings.chartType here
	// because parent mutates nested properties without reassigning the object,
	// which would cause this component to override user toggles. The parent can
	// still listen to chartTypeChange and update its own state if needed.

	$: if (chart && settings.resolution !== prevResolution) {
		prevResolution = settings.resolution;
		applyTimeFormatter();
	}
</script>

<section aria-labelledby="ohlcv-chart-title" class="flex min-w-0 flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<h2 id="ohlcv-chart-title" class="text-h2 text-ink">
				{#if (tokenPair.baseSymbol || '').toUpperCase() === 'VOI'}
					VOI/{tokenPair.quoteSymbol === 'aUSDC'
						? quoteCurrency === 'USD'
							? 'USD'
							: 'aUSDC'
						: tokenPair.quoteSymbol || 'USD'}
				{:else}
					{(tokenPair.baseSymbol || '').toUpperCase() === 'WVOI'
						? 'VOI'
						: tokenPair.baseSymbol}/{tokenPair.quoteSymbol || 'VOI'}
				{/if}
			</h2>
			<p class="text-label text-ink-muted">Pool ID: {tokenPair.poolId || 'N/A'}</p>
			{#if loading}<p role="status" class="text-label text-ink-muted">Loading chart data...</p>{/if}
		</div>
		<div class="flex max-w-full flex-col gap-1">
			<span class="text-label text-ink-muted">Quote</span>
			<Tabs
				variant="segmented"
				label="Quote"
				options={[
					{ value: 'VOI', label: 'VOI' },
					{ value: 'USD', label: 'USD' }
				]}
				value={quoteCurrency}
				onchange={(value) => {
					if (quoteCurrency !== value) {
						quoteCurrency = value as 'VOI' | 'USD';
						dispatch('quoteChange', quoteCurrency);
					}
				}}
			/>
		</div>
	</div>
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex max-w-full flex-col gap-1">
			<span class="text-label text-ink-muted">Chart type</span>
			<Tabs
				variant="segmented"
				label="Chart type"
				options={[
					{ value: 'candlestick', label: 'Candles' },
					{ value: 'line', label: 'Line' }
				]}
				value={chartType}
				onchange={(value) => handleChartTypeChange(value as 'candlestick' | 'line')}
			/>
		</div>
		<div class="flex max-w-full flex-col gap-1">
			<span class="text-label text-ink-muted">Resolution</span>
			<Tabs
				variant="segmented"
				label="Resolution"
				options={resolutions}
				value={settings.resolution}
				onchange={(value) => handleResolutionChange(value as Resolution)}
			/>
		</div>
		<Button
			size="sm"
			variant={settings.showVolume ? 'soft' : 'ghost'}
			aria-pressed={settings.showVolume}
			onclick={toggleVolume}>Volume</Button
		>
		<Button size="sm" variant="ghost" onclick={handleRefresh} disabled={loading}>Refresh</Button>
	</div>
	<p id="ohlcv-chart-description" class="text-label text-ink-muted">{description.summary}</p>
	<p id="ohlcv-chart-instructions" class="text-label text-ink-muted">{inspectionInstructions}</p>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		role="group"
		tabindex="0"
		aria-roledescription="chart"
		aria-labelledby="ohlcv-chart-title"
		aria-describedby="ohlcv-chart-description ohlcv-chart-instructions"
		class="chart-inspection rounded-ds-sm"
		onkeydown={handleInspectionKey}
	>
		<div class="plot relative w-full" style:--plot-height={`${height}px`}>
			<div bind:this={chartContainer} class="absolute inset-0 bg-surface" />
			{#if loading && data.length === 0}
				<div role="status" class="absolute inset-0 flex items-center justify-center text-ink-muted">
					Loading chart data...
				</div>
			{:else if data.length === 0}
				<div
					class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-ink-muted"
				>
					<p>No data available for this token pair</p>
					<p class="text-label">Try selecting a different time resolution or refresh the data</p>
				</div>
			{/if}
		</div>
	</div>
	<p class="text-label text-ink">{inspectedText}</p>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{inspection.announcement}</p>
	{#if displayedData.length > 0}
		<div
			class="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4 text-label"
		>
			<dl class="flex flex-wrap gap-x-6 gap-y-2">
				{#each ['Open', 'High', 'Low', 'Close'] as label}
					<div class="flex flex-wrap gap-1">
						<dt class="text-ink-muted">{label}:</dt>
						<dd class="num font-medium text-ink">
							{description.period[label.toLowerCase() as 'open' | 'high' | 'low' | 'close']}
						</dd>
					</div>
				{/each}
				{#if settings.showVolume}<div class="flex flex-wrap gap-1">
						<dt class="text-ink-muted">Volume:</dt>
						<dd class="num font-medium text-ink">{description.period.volume}</dd>
					</div>{/if}
			</dl>
			<p class="text-ink-muted">{displayedData.length} data points</p>
		</div>
	{/if}
	<details class="min-w-0 text-label">
		<summary class="w-fit cursor-pointer text-accent">View data</summary>
		<!-- A named data region is keyboard scrollable when its table overflows. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			role="region"
			aria-label="OHLCV chart data"
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
