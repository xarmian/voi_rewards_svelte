<!-- PriceChart.svelte -->
<script lang="ts">
	import { theme, onThemeChange } from '$lib/theme.svelte';
	import { onMount, tick } from 'svelte';
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
	let isDarkMode = false;

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

	// Watch for theme changes
	function updateChartTheme() {
		if (!chart) return;

		isDarkMode = theme.current === 'dark';
		const gridColor = isDarkMode ? '#2D3748' : '#E5E7EB';
		const textColor = isDarkMode ? '#9CA3AF' : '#4B5563';

		chart.applyOptions({
			layout: {
				background: { color: 'transparent' },
				textColor: textColor
			},
			grid: {
				vertLines: { color: gridColor },
				horzLines: { color: gridColor }
			},
			rightPriceScale: {
				borderColor: gridColor,
				scaleMargins: {
					top: 0.2,
					bottom: 0.2
				},
				mode: 1
			},
			timeScale: {
				borderColor: gridColor,
				timeVisible: true,
				secondsVisible: false,
				tickMarkFormatter: (time: number) => {
					return formatTimeByPeriod(time, selectedPeriod);
				}
			}
		});
	}

	function handleResize() {
		if (chartContainer && chart) {
			const newWidth = chartContainer.clientWidth;
			const newHeight = height;
			chart.resize(newWidth, newHeight);
		}
	}

	onMount(() => {
		// TASK-31: return cleanup synchronously and guard the pending tick after unmount.
		tick().then(() => {
			if (lifecycle.disposed || !chartContainer) return;
			chart = createChart(chartContainer, {
				height,
				width: chartContainer.clientWidth,
				layout: {
					background: { color: 'transparent' },
					textColor: '#4B5563'
				},
				grid: {
					vertLines: { color: '#E5E7EB' },
					horzLines: { color: '#E5E7EB' }
				},
				rightPriceScale: {
					borderColor: '#E5E7EB',
					scaleMargins: {
						top: 0.2,
						bottom: 0.2
					},
					mode: 1
				},
				timeScale: {
					borderColor: '#E5E7EB',
					timeVisible: true,
					secondsVisible: false,
					tickMarkFormatter: (time: number) => {
						return formatTimeByPeriod(time, selectedPeriod);
					}
				},
				localization: {
					timeFormatter: (time: number) => {
						const date = new Date(time * 1000);
						return date.toLocaleString();
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

			const instance = chart;
			lifecycle.add(() => {
				instance.remove();
				chart = undefined;
				series = undefined;
			});

			series = chart.addLineSeries({
				color: '#8B5CF6',
				lineWidth: 2,
				crosshairMarkerVisible: true,
				lastValueVisible: true,
				priceLineVisible: true
			});

			series.applyOptions({
				priceFormat: {
					type: 'price',
					precision: 6,
					minMove: 0.000001
				}
			});

			if (data.length > 0) {
				series.setData(data);
				// Fit content after setting data
				chart.timeScale().fitContent();
			}

			// Subscribe to theme changes
			lifecycle.add(onThemeChange(updateChartTheme));

			// Initial theme setup
			updateChartTheme();

			// Initial resize
			handleResize();

			// Add resize observer for container size changes
			const resizeObserver = new ResizeObserver(() => {
				if (chartContainer && chart) {
					const newWidth = chartContainer.clientWidth;
					chart.applyOptions({
						width: newWidth
					});
					chart.timeScale().fitContent();
				}
			});
			lifecycle.add(() => resizeObserver.disconnect());
			resizeObserver.observe(chartContainer);

			// Add window resize listener
			window.addEventListener('resize', handleResize);
			lifecycle.add(() => window.removeEventListener('resize', handleResize));
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

<div class="flex flex-col gap-4 w-full">
	<div class="flex justify-between items-center">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
			Price Chart
			{#if selectedMarket}
				- {selectedMarket.exchange} {selectedMarket.pair}
			{:else}
				- All Markets Aggregated
			{/if}
		</h3>
		<div class="flex gap-2">
			{#each periods as period}
				<button
					class="px-3 py-1 text-sm rounded-lg transition-colors
                        {selectedPeriod === period.value
						? 'bg-purple-600 text-white'
						: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
					on:click={() => onPeriodChange(period.value as '24h' | '7d')}
				>
					{period.label}
				</button>
			{/each}
		</div>
	</div>
	<div class="w-full h-[400px]" bind:this={chartContainer}></div>
</div>

<style>
	/* Chart styles */
</style>
