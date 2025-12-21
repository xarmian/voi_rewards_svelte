<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { Button, ButtonGroup, Spinner } from 'flowbite-svelte';
	import {
		createChart,
		type IChartApi,
		type ISeriesApi,
		type CandlestickData,
		type LineData,
		type HistogramData,
		ColorType
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
	export let height = 500;
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
	let chart: IChartApi;
	let mainSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;
	let volumeSeries: ISeriesApi<'Histogram'>;
	let isDarkMode = false;
	let prevPairKey: string | null = null;
	let isInitializing = false;
	let hovered: {
		time?: number;
		open?: number;
		high?: number;
		low?: number;
		close?: number;
		volume?: number;
	} | null = null;

	// Local chart type state to avoid mutating parent prop object
	let chartType: 'candlestick' | 'line' = settings.chartType;
	let chartTypeInitialized = false;
	// Initialize local chartType once from incoming settings on first run
	$: if (!chartTypeInitialized && settings?.chartType) {
		chartType = settings.chartType;
		chartTypeInitialized = true;
	}

	// Debug reactive statement to track quoteCurrency changes
	$: console.log('quoteCurrency reactive update:', quoteCurrency);

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
		{ value: '1m', label: '1M' },
		{ value: '5m', label: '5M' },
		{ value: '15m', label: '15M' },
		{ value: '1h', label: '1H' },
		{ value: '4h', label: '4H' },
		{ value: '1d', label: '1D' }
	];

	function updateChartTheme() {
		if (!chart) return;

		isDarkMode = document.documentElement.classList.contains('dark');
		const backgroundColor = isDarkMode ? '#1F2937' : '#FFFFFF';
		const gridColor = isDarkMode ? '#374151' : '#E5E7EB';
		const textColor = isDarkMode ? '#D1D5DB' : '#4B5563';
		const borderColor = isDarkMode ? '#4B5563' : '#D1D5DB';

		chart.applyOptions({
			layout: {
				background: { type: ColorType.Solid, color: backgroundColor },
				textColor: textColor
			},
			grid: {
				vertLines: { color: gridColor },
				horzLines: { color: gridColor }
			},
			rightPriceScale: {
				borderColor: borderColor,
				scaleMargins: {
					top: 0.1,
					bottom: settings.showVolume ? 0.4 : 0.1
				}
			},
			timeScale: {
				borderColor: borderColor,
				timeVisible: true,
				secondsVisible: false
			}
		});
	}

	function initializeChart() {
		if (!chartContainer) {
			console.error('Chart container not found');
			return;
		}

		if (isInitializing || chart) {
			return;
		}
		isInitializing = true;

		console.log('Initializing chart with container:', chartContainer);
		console.log('Container dimensions:', { width: chartContainer.clientWidth, height: height });

		if (chartContainer.clientWidth === 0) {
			console.warn('Chart container has zero width, retrying...');
			setTimeout(() => initializeChart(), 100);
			return;
		}

		chart = createChart(chartContainer, {
			height,
			width: chartContainer.clientWidth,
			layout: {
				background: { type: ColorType.Solid, color: '#FFFFFF' },
				textColor: '#4B5563'
			},
			grid: {
				vertLines: { color: '#E5E7EB' },
				horzLines: { color: '#E5E7EB' }
			},
			rightPriceScale: {
				borderColor: '#D1D5DB',
				scaleMargins: {
					top: 0.1,
					bottom: settings.showVolume ? 0.4 : 0.1
				}
			},
			timeScale: {
				borderColor: '#D1D5DB',
				timeVisible: true,
				secondsVisible: false,
				tickMarkFormatter: (time: number) => {
					const ts = typeof time === 'number' ? time : (time as unknown as number);
					return formatTimeByResolution(ts, settings.resolution);
				}
			},
			crosshair: {
				mode: 1,
				vertLine: {
					labelVisible: true
				},
				horzLine: {
					labelVisible: true
				}
			}
		});

		// Reset any previous series handles from old chart instances
		mainSeries = undefined as any;
		volumeSeries = undefined as any;

		// Reset any previous series handles from old chart instances
		mainSeries = undefined as any;
		volumeSeries = undefined as any;

		createMainSeries();

		if (settings.showVolume) {
			createVolumeSeries();
		}

		updateChartTheme();
		applyTimeFormatter();

		// Subscribe to crosshair to update footer stats with hovered values
		chart.subscribeCrosshairMove((param: any) => {
			try {
				if (!param || !mainSeries) {
					hovered = null;
					return;
				}
				const seriesData =
					param.seriesData?.get?.(mainSeries as any) ||
					param.seriesPrices?.get?.(mainSeries as any);
				if (seriesData && typeof seriesData === 'object') {
					// For candlesticks we get {open,high,low,close}; for line we get {value}
					const t = param.time
						? typeof param.time === 'number'
							? param.time
							: param.time?.year
								? Math.floor(
										new Date(
											param.time.year,
											(param.time.month || 1) - 1,
											param.time.day || 1
										).getTime() / 1000
									)
								: 0
						: undefined;
					// Try to lookup a volume value at the same time
					let vol: number | undefined = undefined;
					if (t && Array.isArray(volumes) && volumes.length) {
						const match = volumes.find((v) => v.time === t);
						if (match) vol = match.value;
					}
					if ('open' in seriesData) {
						hovered = {
							time: t,
							open: seriesData.open,
							high: seriesData.high,
							low: seriesData.low,
							close: seriesData.close,
							volume: vol
						};
					} else if ('value' in seriesData) {
						hovered = {
							time: t,
							open: seriesData.value,
							high: seriesData.value,
							low: seriesData.value,
							close: seriesData.value,
							volume: vol
						};
					}
				} else {
					hovered = null;
				}
			} catch (e) {
				console.warn('crosshair handler error', e);
			}
		});

		// Update data if available
		if (data.length > 0) {
			updateChartData();
		}

		console.log('Chart initialization complete');
		isInitializing = false;

		// Set up resize observer
		const resizeObserver = new ResizeObserver(() => {
			if (chart && chartContainer) {
				chart.applyOptions({
					width: chartContainer.clientWidth
				});
				// Auto-fit on container resize for better automatic zoom
				chart.timeScale().fitContent();
			}
		});
		resizeObserver.observe(chartContainer);

		// Set up theme observer
		const themeObserver = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.attributeName === 'class') {
					updateChartTheme();
				}
			});
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});

		return () => {
			resizeObserver.disconnect();
			themeObserver.disconnect();
			if (chart) {
				chart.remove();
			}
		};
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
				upColor: '#22c55e',
				downColor: '#ef4444',
				borderDownColor: '#ef4444',
				borderUpColor: '#22c55e',
				wickDownColor: '#ef4444',
				wickUpColor: '#22c55e'
			});
		} else {
			mainSeries = chart.addLineSeries({
				priceScaleId: 'right',
				color: '#8B5CF6',
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
			color: '#E5E7EB',
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
		console.log('updateChartData called', {
			mainSeries: !!mainSeries,
			dataLength: data.length,
			chartType
		});

		if (!mainSeries || !data.length) {
			console.log('updateChartData: Missing mainSeries or data');
			return;
		}

		console.log('Updating chart with data:', data.slice(0, 3)); // Show first 3 items

		// Sort data by time to ensure proper ordering
		const sortedData = [...data].sort((a, b) => a.time - b.time);
		console.log('Data time range:', {
			start: sortedData[0]?.time,
			end: sortedData[sortedData.length - 1]?.time
		});

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
			const candlestickData: CandlestickData[] = sortedData.map((item) => ({
				time: item.time,
				open: item.open,
				high: item.high,
				low: item.low,
				close: item.close
			}));
			console.log('Setting candlestick data:', candlestickData.slice(0, 2));
			(mainSeries as ISeriesApi<'Candlestick'>).setData(candlestickData);
		} else {
			const lineData: LineData[] = sortedData.map((item) => ({
				time: item.time,
				value: item.close
			}));
			console.log('Setting line data:', lineData.slice(0, 2));
			(mainSeries as ISeriesApi<'Line'>).setData(lineData);
		}

		// Handle volume series presence and bottom whitespace
		if (settings.showVolume) {
			if (volumes.length > 0) {
				if (!volumeSeries) {
					createVolumeSeries();
				}
				const sortedVolumes = [...volumes].sort((a, b) => a.time - b.time);
				const volumeData: HistogramData[] = sortedVolumes.map((item) => ({
					time: item.time,
					value: item.value,
					color: item.color || '#E5E7EB'
				}));
				console.log('Setting volume data:', volumeData.slice(0, 2));
				volumeSeries.setData(volumeData);
				chart.priceScale('right').applyOptions({
					scaleMargins: { top: 0.1, bottom: 0.4 }
				});
			} else {
				if (volumeSeries) {
					chart.removeSeries(volumeSeries);
					volumeSeries = undefined as any;
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

		console.log('Chart data updated, fitting content');
	}

	function handleResolutionChange(resolution: Resolution) {
		console.log('Resolution change requested to', resolution);
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

		if (settings.showVolume) {
			createVolumeSeries();
			updateChartData();
		} else if (volumeSeries) {
			chart.removeSeries(volumeSeries);
			volumeSeries = undefined as any;
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
		console.log('toggleQuoteCurrency called, current:', quoteCurrency);
		quoteCurrency = quoteCurrency === 'VOI' ? 'USD' : 'VOI';
		console.log('quoteCurrency updated to:', quoteCurrency);
		dispatch('quoteChange', quoteCurrency);
		console.log('quoteChange event dispatched');
	}

	onMount(() => {
		// Delay initialization to ensure DOM is ready
		setTimeout(() => {
			const cleanup = initializeChart();
			return cleanup;
		}, 100);
	});

	onDestroy(() => {
		if (chart) {
			chart.remove();
		}
		mainSeries = undefined as any;
		volumeSeries = undefined as any;
	});

	// Reactive updates: update chart whenever new data arrives or resolution changes
	let prevSig = '';
	$: {
		const firstTs = data?.[0]?.time ?? 0;
		const lastTs = data?.[data.length - 1]?.time ?? 0;
		const firstClose = data?.[0]?.close ?? 0;
		const lastClose = data?.[data.length - 1]?.close ?? 0;
		const sig = `${data?.length || 0}:${firstTs}-${lastTs}:${firstClose}:${lastClose}:${settings.resolution}:${chartType}`;
		if (sig !== prevSig) {
			prevSig = sig;
			if (chart && mainSeries) {
				if (data && data.length > 0) {
					updateChartData();
				} else {
					// Clear series when no data and reset scales/volume
					if (chartType === 'candlestick') {
						(mainSeries as ISeriesApi<'Candlestick'>).setData([]);
					} else {
						(mainSeries as ISeriesApi<'Line'>).setData([]);
					}
					if (volumeSeries) {
						chart.removeSeries(volumeSeries);
						volumeSeries = undefined as any;
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
		console.log('Chart type actually changed, recreating series');
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

<div
	class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
>
	<!-- Chart Header -->
	<div class="flex flex-col gap-4 p-4 border-b border-gray-200 dark:border-gray-700">
		<div class="flex items-center justify-between w-full">
			<div>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
					{(tokenPair.baseSymbol || '').toUpperCase() === 'WVOI' ? 'VOI' : tokenPair.baseSymbol}/VOI
					{#if loading}
						<Spinner size="4" class="ml-2" />
					{/if}
				</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Pool ID: {tokenPair.poolId || 'N/A'}
				</p>
			</div>

			<!-- Quote Currency Slider -->
			<div class="flex items-center gap-3">
				<span class="text-sm font-medium text-gray-600 dark:text-gray-400">Quote:</span>
				<div class="relative">
					<div class="flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
						<button
							class="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200"
							class:bg-white={quoteCurrency === 'VOI'}
							class:dark:bg-gray-800={quoteCurrency === 'VOI'}
							class:text-gray-900={quoteCurrency === 'VOI'}
							class:dark:text-white={quoteCurrency === 'VOI'}
							class:shadow-sm={quoteCurrency === 'VOI'}
							class:text-gray-600={quoteCurrency !== 'VOI'}
							class:dark:text-gray-400={quoteCurrency !== 'VOI'}
							class:hover:text-gray-900={quoteCurrency !== 'VOI'}
							class:dark:hover:text-white={quoteCurrency !== 'VOI'}
							on:click={() => {
								if (quoteCurrency !== 'VOI') {
									console.log('Setting quoteCurrency to VOI');
									quoteCurrency = 'VOI';
									dispatch('quoteChange', quoteCurrency);
								}
							}}
						>
							VOI
						</button>
						<button
							class="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200"
							class:bg-white={quoteCurrency === 'USD'}
							class:dark:bg-gray-800={quoteCurrency === 'USD'}
							class:text-gray-900={quoteCurrency === 'USD'}
							class:dark:text-white={quoteCurrency === 'USD'}
							class:shadow-sm={quoteCurrency === 'USD'}
							class:text-gray-600={quoteCurrency !== 'USD'}
							class:dark:text-gray-400={quoteCurrency !== 'USD'}
							class:hover:text-gray-900={quoteCurrency !== 'USD'}
							class:dark:hover:text-white={quoteCurrency !== 'USD'}
							on:click={() => {
								if (quoteCurrency !== 'USD') {
									console.log('Setting quoteCurrency to USD');
									quoteCurrency = 'USD';
									dispatch('quoteChange', quoteCurrency);
								}
							}}
						>
							USD
						</button>
					</div>
				</div>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2 justify-between">
			<!-- Chart Type Toggle -->
			<ButtonGroup>
				<Button
					size="sm"
					color={chartType === 'candlestick' ? 'primary' : 'alternative'}
					on:click={() => handleChartTypeChange('candlestick')}
				>
					<i class="fas fa-chart-bar mr-1"></i>
					Candles
				</Button>
				<Button
					size="sm"
					color={chartType === 'line' ? 'primary' : 'alternative'}
					on:click={() => handleChartTypeChange('line')}
				>
					<i class="fas fa-chart-line mr-1"></i>
					Line
				</Button>
			</ButtonGroup>

			<!-- Resolution Selector -->
			<ButtonGroup>
				{#each resolutions as resolution}
					<Button
						size="sm"
						color={settings.resolution === resolution.value ? 'primary' : 'alternative'}
						on:click={() => handleResolutionChange(resolution.value)}
					>
						{resolution.label}
					</Button>
				{/each}
			</ButtonGroup>

			<!-- Volume Toggle -->
			<Button
				size="sm"
				color={settings.showVolume ? 'primary' : 'alternative'}
				on:click={toggleVolume}
			>
				<i class="fas fa-chart-area mr-1"></i>
				Volume
			</Button>

			<!-- Refresh Button -->
			<Button size="sm" color="light" on:click={handleRefresh} disabled={loading}>
				<i class="fas fa-sync-alt {loading ? 'animate-spin' : ''} mr-1"></i>
				Refresh
			</Button>
		</div>
	</div>

	<!-- Chart Container -->
	<div class="p-4">
		<div class="relative" style="height: {height}px; width: 100%; min-height: 400px;">
			<div bind:this={chartContainer} class="absolute inset-0 bg-gray-50 dark:bg-gray-900" />
			{#if loading && data.length === 0}
				<div class="absolute inset-0 flex items-center justify-center">
					<div class="text-center">
						<Spinner size="8" class="mb-4" />
						<p class="text-gray-500 dark:text-gray-400">Loading chart data...</p>
					</div>
				</div>
			{:else if data.length === 0}
				<div class="absolute inset-0 flex items-center justify-center">
					<div class="text-center">
						<i class="fas fa-chart-line text-4xl text-gray-400 mb-4"></i>
						<p class="text-gray-500 dark:text-gray-400">No data available for this token pair</p>
						<p class="text-sm text-gray-400 dark:text-gray-500 mt-2">
							Try selecting a different time resolution or refresh the data
						</p>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Chart Footer with Stats -->
	{#if data.length > 0}
		<div
			class="flex flex-wrap items-center justify-between gap-4 p-4 border-t border-gray-200 dark:border-gray-700 text-sm"
		>
			<div class="flex gap-6">
				{#if hovered}
					<div>
						<span class="text-gray-500 dark:text-gray-400">Open:</span>
						<span class="font-medium text-gray-900 dark:text-white ml-1"
							>{hovered.open?.toFixed(6) ?? '—'}</span
						>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">High:</span>
						<span class="font-medium text-green-600 dark:text-green-400 ml-1"
							>{hovered.high?.toFixed(6) ?? '—'}</span
						>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">Low:</span>
						<span class="font-medium text-red-600 dark:text-red-400 ml-1"
							>{hovered.low?.toFixed(6) ?? '—'}</span
						>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">Close:</span>
						<span class="font-medium text-gray-900 dark:text-white ml-1"
							>{hovered.close?.toFixed(6) ?? '—'}</span
						>
					</div>
				{:else}
					<div>
						<span class="text-gray-500 dark:text-gray-400">Open:</span>
						<span class="font-medium text-gray-900 dark:text-white ml-1"
							>{data[0]?.open.toFixed(6) || '—'}</span
						>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">High:</span>
						<span class="font-medium text-green-600 dark:text-green-400 ml-1"
							>{Math.max(...data.map((d) => d.high)).toFixed(6)}</span
						>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">Low:</span>
						<span class="font-medium text-red-600 dark:text-red-400 ml-1"
							>{Math.min(...data.map((d) => d.low)).toFixed(6)}</span
						>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">Close:</span>
						<span class="font-medium text-gray-900 dark:text-white ml-1"
							>{data[data.length - 1]?.close.toFixed(6) || '—'}</span
						>
					</div>
				{/if}
				{#if settings.showVolume}
					<div>
						<span class="text-gray-500 dark:text-gray-400">Volume:</span>
						<span class="font-medium text-gray-900 dark:text-white ml-1"
							>{hovered?.volume ??
								volumes.reduce((sum, v) => sum + v.value, 0).toLocaleString()}</span
						>
					</div>
				{/if}
			</div>
			<div class="text-gray-400 dark:text-gray-500">
				{data.length} data points
			</div>
		</div>
	{/if}
</div>
