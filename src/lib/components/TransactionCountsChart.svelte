<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import * as echarts from 'echarts';
	import type { EChartsOption } from 'echarts';
	import { Button } from 'flowbite-svelte';

	export let data: Array<{ bucket_start: string; tx_count: number }> = [];
	export let period: 'day' | 'week' = 'day';
	export let onPeriodChange: (newPeriod: 'day' | 'week') => void = () => {};

	let chartDiv: HTMLElement;
	let chart: echarts.ECharts;

	$: if (chartDiv && browser && data.length > 0) {
		updateChart();
	}

	function formatDate(dateStr: string, period: string): string {
		const date = new Date(dateStr);
		switch (period) {
			case 'day':
				return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
			case 'week':
				return `Week of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
			default:
				return date.toLocaleDateString();
		}
	}

	function formatNumber(num: number): string {
		if (num >= 1000000) {
			return (num / 1000000).toFixed(1) + 'M';
		} else if (num >= 1000) {
			return (num / 1000).toFixed(1) + 'K';
		}
		return num.toString();
	}

	function updateChart() {
		if (!chart || !data.length || !browser) return;

		const isDarkMode = document.documentElement.classList.contains('dark');
		const textColor = isDarkMode ? '#9CA3AF' : '#4B5563';
		const gridColor = isDarkMode ? '#374151' : '#E5E7EB';
		const backgroundColor = 'transparent';

		// Sort data chronologically
		const sortedData = [...data].sort(
			(a, b) => new Date(a.bucket_start).getTime() - new Date(b.bucket_start).getTime()
		);

		// Prepare chart data
		const chartData = sortedData.map((d) => ({
			date: formatDate(d.bucket_start, period),
			value: d.tx_count,
			timestamp: d.bucket_start
		}));

		const options: EChartsOption = {
			backgroundColor,
			tooltip: {
				trigger: 'axis',
				axisPointer: {
					type: 'line'
				},
				backgroundColor: isDarkMode ? '#1F2937' : 'white',
				borderColor: isDarkMode ? '#374151' : '#E5E7EB',
				textStyle: {
					color: textColor
				},
				formatter: (params: any) => {
					if (!Array.isArray(params) || params.length === 0) return '';
					
					const dataIndex = params[0].dataIndex;
					const actualData = sortedData[dataIndex];
					const fullDate = new Date(actualData.bucket_start).toLocaleDateString(undefined, {
						weekday: 'long',
						year: 'numeric',
						month: 'long',
						day: 'numeric'
					});
					
					const label = period === 'week' ? 'Transactions' : 'Transactions';
					return `
                        <div class="font-bold">${fullDate}</div>
                        <div>${label}: <span class="font-semibold">${params[0].value.toLocaleString()}</span></div>
                    `;
				}
			},
			grid: {
				left: '3%',
				right: '4%',
				bottom: '100',
				top: '40',
				containLabel: true
			},
			xAxis: {
				type: 'category',
				data: chartData.map((d) => d.date),
				axisLabel: {
					color: textColor,
					rotate: 45,
					interval: 0
				},
				axisLine: {
					lineStyle: { color: gridColor }
				}
			},
			yAxis: {
				type: 'value',
				name: 'Transactions',
				nameLocation: 'middle',
				nameGap: 50,
				axisLabel: {
					color: textColor,
					formatter: (value: number) => formatNumber(value)
				},
				axisLine: {
					lineStyle: { color: gridColor }
				},
				splitLine: {
					lineStyle: { color: gridColor }
				}
			},
			series: [
				{
					name: 'Transaction Count',
					type: 'line',
					smooth: true,
					symbol: 'circle',
					symbolSize: 6,
					data: chartData.map((d) => d.value),
					lineStyle: {
						width: 3,
						color: isDarkMode ? '#10B981' : '#059669'
					},
					areaStyle: {
						color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
							{
								offset: 0,
								color: isDarkMode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(5, 150, 105, 0.2)'
							},
							{
								offset: 1,
								color: isDarkMode ? 'rgba(16, 185, 129, 0)' : 'rgba(5, 150, 105, 0)'
							}
						])
					},
					itemStyle: {
						color: isDarkMode ? '#10B981' : '#059669'
					}
				}
			]
		};

		chart.setOption(options);
	}

	onMount(() => {
		if (!chartDiv || !browser) return;

		chart = echarts.init(chartDiv);

		const resizeObserver = new ResizeObserver(() => {
			chart.resize();
		});

		resizeObserver.observe(chartDiv);

		// Watch for theme changes
		const observer = new MutationObserver(() => {
			updateChart();
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});

		return () => {
			resizeObserver.disconnect();
			observer.disconnect();
			chart.dispose();
		};
	});
</script>

<div class="w-full">
	<!-- Period selector -->
	<div class="flex gap-2 mb-4">
		<Button
			size="sm"
			color={period === 'day' ? 'primary' : 'alternative'}
			on:click={() => onPeriodChange('day')}
		>
			30 Days
		</Button>
		<Button
			size="sm"
			color={period === 'week' ? 'primary' : 'alternative'}
			on:click={() => onPeriodChange('week')}
		>
			15 Weeks
		</Button>
	</div>

	<!-- Chart container -->
	<div class="w-full h-[300px]" bind:this={chartDiv}></div>
</div>