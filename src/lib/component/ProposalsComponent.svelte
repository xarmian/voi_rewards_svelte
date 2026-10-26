<script lang="ts">
	import { theme, onThemeChange } from '$lib/theme.svelte';
	import { escapeHtml } from '$lib/utils/escapeHtml';
	import { onMount } from 'svelte';
	import { createChartLifecycle } from '$lib/utils/chartLifecycle';
	import { browser } from '$app/environment';
	import * as echarts from 'echarts';
	import type { EChartsOption } from 'echarts';
	import { format, PeriodType } from 'svelte-ux';
	import { Spinner } from 'flowbite-svelte';
	import { config } from '../config';
	import { getSupplyInfo, getAccountInfo, onlineStakeStore } from '$lib/stores/accounts';
	import type { Account } from '$lib/stores/accounts';

	export let walletId: string;

	let apiData: any;
	$: apiData = null;
	let data: any;
	$: data = [];

	let screenSize: number;
	let chartDiv: HTMLElement;
	let chart: echarts.ECharts | null = null;
	let chartLifecycle: ReturnType<typeof createChartLifecycle> | null = null;

	let supply: any;
	$: accountInfo = null as Account | null;
	let expectedBlockTime: string | null = null;
	let historicalExpectedProposals: any = {};
	let expectedUnavailable = false;

	let isLoading = false;
	let proposalsRequestId = 0;
	let loadError: string | null = null;
	let isMounted = false;

	// Watch for wallet changes
	$: if (walletId && isMounted) {
		updateChartData();
	}

	// Track when chartDiv becomes available and data changes
	$: if (chartDiv && browser && isMounted && data.length > 0) {
		ensureChart();
	}

	// Track when chartDiv is removed (during loading)
	$: if (!chartDiv && chart) {
		disposeChart();
	}

	// TASK-31: loading can remove the div; release that chart's listeners with it.
	function disposeChart() {
		chartLifecycle?.dispose();
		chartLifecycle = null;
		chart = null;
	}

	function ensureChart() {
		if (!chartDiv || !browser || !isMounted) return;

		try {
			// Force the div to have dimensions if they're missing
			if (!chartDiv.clientWidth || !chartDiv.clientHeight) {
				chartDiv.style.width = '100%';
				chartDiv.style.height = '300px';
			}

			if (!chart) {
				chart = echarts.init(chartDiv);
				const instance = chart;
				chartLifecycle = createChartLifecycle();
				chartLifecycle.add(() => instance.dispose());

				// Subscribe to theme changes
				chartLifecycle.add(onThemeChange(updateChartTheme));

				window.addEventListener('resize', handleResize);
				chartLifecycle.add(() => window.removeEventListener('resize', handleResize));
			}

			// Update chart with current data
			updateChart();
		} catch (error) {
			console.error('Error in ensureChart:', error);
		}
	}

	async function fetchOnlineStakeHistory() {
		return await onlineStakeStore.getData();
	}

	async function updateChartData() {
		const requested = walletId;
		const requestId = ++proposalsRequestId;
		apiData = null;
		data = [];
		loadError = null;
		expectedUnavailable = false;
		expectedBlockTime = null;
		accountInfo = null;

		isLoading = true;

		// TASK-31: the div removal releases its chart and subscriptions reactively.

		const url = `${config.proposalApiBaseUrl}?action=proposals&wallet=${requested}`;
		try {
			const [response, accountInfoResult, supplyResult] = await Promise.all([
				fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) }),
				getAccountInfo(requested),
				getSupplyInfo()
			]);
			if (requestId !== proposalsRequestId) return;

			if (!response.ok) throw new Error(`Failed to fetch proposals: HTTP ${response.status}`);
			const proposals = await response.json();
			if (requestId !== proposalsRequestId) return;
			apiData = proposals;
			accountInfo = accountInfoResult ?? null;
			supply = supplyResult;
			expectedUnavailable = accountInfoResult === undefined || supplyResult == null;
			expectedBlockTime = null;
			historicalExpectedProposals = {};

			// Calculate expected block time using current supply
			if (!expectedUnavailable && accountInfo?.amount && supply?.['online-money']) {
				const balance = Number(accountInfo?.amount);
				const secondsPerDay = 24 * 60 * 60;
				const blocksPerDay = secondsPerDay / 2.8;
				const dailyBlocks = (balance / Number(supply?.['online-money'] ?? 0)) * blocksPerDay;
				const avgBlockTime = secondsPerDay / dailyBlocks;

				const hours = Math.floor(avgBlockTime / (60 * 60));
				const minutes = Math.floor((avgBlockTime % (60 * 60)) / 60);
				expectedBlockTime = `${hours}h ${minutes}m`;
			}

			// Calculate expected proposals using chartData
			if (!expectedUnavailable) {
				const chartData = await fetchOnlineStakeHistory();
				if (requestId !== proposalsRequestId) return;
				if (chartData === null) {
					expectedUnavailable = true;
				} else chartData.forEach((dayData: { date: string; avg_online_stake: number }) => {
					if (new Date(dayData.date) < new Date('2024-10-30')) return;
					if (dayData.avg_online_stake) {
						const balance = Number(accountInfo?.amount ?? 0);
						const secondsPerDay = 24 * 60 * 60;
						const blocksPerDay = secondsPerDay / 2.8;
						const expectedBlocks = (balance / dayData.avg_online_stake) * blocksPerDay;
						historicalExpectedProposals[dayData.date] = expectedBlocks;
					}
				});
			}

			data = Object.keys(apiData).map((date) => ({
				date: new Date(date + 'T00:00:00'),
				actual: apiData[date].length,
				expected: expectedUnavailable ? null : (historicalExpectedProposals[date] ?? null)
			}));

			data.sort((a: { date: Date }, b: { date: Date }) => a.date.getTime() - b.date.getTime());
			loadError = null;
		} catch (error) {
			if (requestId !== proposalsRequestId) return;
			loadError = error instanceof Error ? error.message : String(error);
			console.error('Error in updateChartData:', error);
		} finally {
			if (requestId === proposalsRequestId) isLoading = false;
		}
	}

	function updateChart() {
		if (!chart || !data.length || !browser) return;

		const isDarkMode = theme.current === 'dark';
		const textColor = isDarkMode ? '#9CA3AF' : '#4B5563';
		const gridColor = isDarkMode ? '#374151' : '#E5E7EB';
		const backgroundColor = 'transparent';

		const options: EChartsOption = {
			backgroundColor,
			tooltip: {
				trigger: 'axis',
				axisPointer: {
					type: 'shadow'
				},
				backgroundColor: isDarkMode ? '#1F2937' : 'white',
				borderColor: isDarkMode ? '#374151' : '#E5E7EB',
				textStyle: {
					color: textColor
				},
				formatter: (params: any) => {
					if (!Array.isArray(params)) return '';
					const date = new Date(params[0].axisValue);
					const formattedDate = format(date, PeriodType.Custom, {
						custom: 'eee, MMMM do'
					});
					let result = `${escapeHtml(formattedDate)}<br/>`;
					const expected = params.find((p: any) => p.seriesName === 'Expected Proposals' && p.value != null);
					const actual = params.find((p: any) => p.seriesName === 'Actual Proposals');
					if (expected) {
						result += `Expected Proposals: ${escapeHtml(Math.round(expected.value))}<br/>`;
					}
					if (actual) {
						result += `Actual Proposals: ${escapeHtml(Math.round(actual.value))}<br/>`;
					}
					if (expected && actual) {
						const diff = actual.value - expected.value;
						result += `Difference: ${diff > 0 ? '+' : ''}${escapeHtml(Math.round(diff))}`;
					}
					return result;
				}
			},
			animation: false,
			legend: {
				data: ['Expected Proposals', 'Actual Proposals'],
				textStyle: {
					color: textColor
				},
				top: 0
			},
			grid: {
				left: '3%',
				right: '4%',
				bottom: '40',
				top: '40',
				containLabel: true
			},
			xAxis: {
				type: 'category',
				data: data.map((d: any) => d.date.toISOString()),
				axisLabel: {
					color: textColor,
					rotate: 45,
					formatter: (value: string) => {
						const date = new Date(value);
						return format(date, PeriodType.Day, { variant: 'short' });
					}
				},
				axisLine: {
					lineStyle: { color: gridColor }
				},
				axisTick: {
					alignWithLabel: true
				}
			},
			yAxis: {
				type: 'value',
				axisLabel: {
					color: textColor
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
					name: 'Expected Proposals',
					type: 'bar',
					data: data.map((d: any) => d.expected),
					itemStyle: {
						color: isDarkMode ? '#34D399' : '#10B981'
					},
					barGap: '0%',
					barWidth: '40%'
				},
				{
					name: 'Actual Proposals',
					type: 'bar',
					data: data.map((d: any) => d.actual),
					itemStyle: {
						color: isDarkMode ? '#60A5FA' : '#3B82F6'
					},
					barGap: '0%',
					barWidth: '40%'
				}
			]
		};

		try {
			chart.setOption(options, true);
		} catch (error) {
			console.error('Error updating chart:', error);
		}
	}

	function handleResize() {
		if (!chart || !browser) return;
		try {
			chart.resize();
		} catch (error) {
			console.error('Error resizing chart:', error);
		}
	}

	// Watch for theme changes
	function updateChartTheme() {
		if (!chart) return;
		updateChart();
	}

	onMount(() => {
		if (!browser) return;

		isMounted = true;
		return () => {
			isMounted = false;
			proposalsRequestId++;
			disposeChart();
		};
	});

	$: screenSize = browser ? (window?.innerWidth ?? 1024) : 1024;
</script>

<svelte:window bind:innerWidth={screenSize} />

<div class="bg-white dark:bg-gray-900 rounded-lg shadow-md w-full">
	<div class="p-6">
		<div class="flex justify-between items-center mb-6">
			<h3 class="text-xl font-bold text-gray-800 dark:text-gray-200">Proposals</h3>
			{#if expectedBlockTime}
				<div class="text-sm text-gray-600 dark:text-gray-400">
					Expected block every: {expectedBlockTime}
				</div>
			{/if}
		</div>
		{#if isLoading}
			<div class="flex justify-center items-center h-64">
				<Spinner size="16" />
			</div>
		{:else if loadError}
			<div class="text-center text-gray-500 dark:text-gray-400 py-8" role="status">
				Couldn't load proposals.
				<button type="button" class="ml-2 text-blue-600 dark:text-blue-400 hover:underline" on:click={() => updateChartData()}>Retry</button>
			</div>
		{:else if apiData == null}
			<div class="flex justify-center items-center h-64">
				<Spinner size="16" />
			</div>
		{:else if Object.keys(apiData).length === 0}
			<div class="text-center text-gray-500 dark:text-gray-400 py-8">
				No proposals found in last 30 days
			</div>
		{:else}
			{#if accountInfo && accountInfo.status !== 'Online'}
				<div
					class="p-4 mb-4 text-sm text-yellow-800 bg-yellow-50 rounded-lg dark:bg-yellow-900 dark:text-yellow-100"
				>
					<div class="flex items-center mb-2">
						<svg
							class="w-5 h-5 mr-2"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="currentColor"
						>
							<path d="M12 2L1 21h22L12 2zm0 3.45l8.4 14.55H3.6L12 5.45z" />
							<path d="M11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
						</svg>
						<span class="font-medium text-base">Important Notice</span>
					</div>
					<div class="ml-7 space-y-2">
						<p>
							This account is not participating in consensus. You will not be able to propose or
							vote on blocks. <a
								href="/faq#how-do-i-get-started-running-a-node-"
								class="text-yellow-900 dark:text-yellow-200 underline hover:no-underline"
								>Learn how to get started running a node</a
							>.
						</p>
						<div class="flex items-center pt-1">
							<span class="font-medium">Account:</span>
							<span class="ml-2 font-mono bg-yellow-100 dark:bg-yellow-800 px-2 py-0.5 rounded"
								>{walletId}</span
							>
						</div>
					</div>
				</div>
			{/if}
			{#if expectedUnavailable}
				<p class="mb-2 text-xs text-gray-500 dark:text-gray-400">Expected proposals unavailable.</p>
			{/if}
			<div
				class="h-[300px] p-4 border border-gray-200 dark:border-gray-700 rounded"
				bind:this={chartDiv}
				style="min-height: 300px; width: 100%; position: relative;"
			></div>
		{/if}
	</div>
</div>
