<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { Card, Button, Badge, Tabs, TabItem } from 'flowbite-svelte';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		close: void;
		addToken: void;
		removeToken: UniqueToken;
		export: { format: 'png' | 'pdf' };
	}>();

	export let tokens: UniqueToken[] = [];
	export let maxTokens = 4;

	interface TokenAnalytics {
		tokenId: number;
		symbol: string;
		type: string;
		imageUrl?: string;
		metrics: {
			volume24h: number;
			volume7d: number;
			volume30d: number;
			tvl: number;
			priceChange24h: number;
			priceChange7d: number;
			priceChange30d: number;
			marketCap?: number;
			uniqueTraders24h: number;
			swapCount24h: number;
			poolCount: number;
			efficiency?: number;
			volatility?: number;
			momentum?: number;
		};
		chartData?: any[];
	}

	let analytics: TokenAnalytics[] = [];
	let loading = false;
	let correlationData: { [key: string]: number } = {};
	let selectedView: 'overview' | 'metrics' | 'charts' | 'correlation' = 'overview';

	// Metric definitions for comparison
	const comparisonMetrics = [
		{
			key: 'volume24h',
			label: '24h Volume',
			format: (value: number) => `$${formatNumber(value)}`,
			icon: 'fas fa-chart-bar',
			description: 'Trading volume in the last 24 hours',
			higherIsBetter: true
		},
		{
			key: 'tvl',
			label: 'Total Value Locked',
			format: (value: number) => `$${formatNumber(value)}`,
			icon: 'fas fa-lock',
			description: 'Total value locked in liquidity pools',
			higherIsBetter: true
		},
		{
			key: 'priceChange24h',
			label: '24h Price Change',
			format: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`,
			icon: 'fas fa-arrow-trend-up',
			description: 'Price change percentage in 24 hours',
			higherIsBetter: true,
			colorCoded: true
		},
		{
			key: 'uniqueTraders24h',
			label: 'Unique Traders (24h)',
			format: (value: number) => formatNumber(value),
			icon: 'fas fa-users',
			description: 'Number of unique traders in 24 hours',
			higherIsBetter: true
		},
		{
			key: 'swapCount24h',
			label: 'Swap Count (24h)',
			format: (value: number) => formatNumber(value),
			icon: 'fas fa-exchange-alt',
			description: 'Number of swaps in 24 hours',
			higherIsBetter: true
		},
		{
			key: 'poolCount',
			label: 'Active Pools',
			format: (value: number) => value.toString(),
			icon: 'fas fa-swimming-pool',
			description: 'Number of active liquidity pools',
			higherIsBetter: true
		}
	];

	onMount(() => {
		if (tokens.length > 0) {
			loadAnalytics();
		}
	});

	$: if (tokens.length > 0) {
		loadAnalytics();
	}

	async function loadAnalytics() {
		loading = true;
		analytics = [];

		try {
			const analyticsPromises = tokens.map(async (token) => {
				const [analyticsResponse, chartResponse] = await Promise.allSettled([
					fetch(`/api/token-analytics?tokenId=${token.id}`),
					fetch(`/api/token-pairs?tokenId=${token.id}&limit=5`)
				]);

				let tokenAnalytics: any = null;
				let chartData: any[] = [];

				if (analyticsResponse.status === 'fulfilled') {
					const data = await analyticsResponse.value.json();
					if (data.success) {
						tokenAnalytics = data.analytics;
					}
				}

				if (chartResponse.status === 'fulfilled') {
					const data = await chartResponse.value.json();
					chartData = data.pairs || [];
				}

				// Calculate additional metrics
				const volume24h = tokenAnalytics?.volume?.volume24h || 0;
				const volume7d = tokenAnalytics?.volume?.volume7d || 0;
				const volatility = calculateVolatility(chartData);
				const momentum = volume24h > 0 && volume7d > 0 ? volume24h / (volume7d / 7) : 0;
				const efficiency = tokenAnalytics?.volume?.swapCount24h > 0 
					? volume24h / tokenAnalytics.volume.swapCount24h 
					: 0;

				return {
					tokenId: token.id,
					symbol: token.symbol,
					type: token.type,
					imageUrl: token.imageUrl,
					metrics: {
						volume24h,
						volume7d: volume7d,
						volume30d: tokenAnalytics?.volume?.volume30d || 0,
						tvl: tokenAnalytics?.liquidity?.totalTvlUsd || 0,
						priceChange24h: Math.random() * 20 - 10, // Mock - replace with real data
						priceChange7d: Math.random() * 30 - 15, // Mock - replace with real data
						priceChange30d: Math.random() * 50 - 25, // Mock - replace with real data
						marketCap: tokenAnalytics?.liquidity?.totalTvlUsd * 5 || 0, // Mock calculation
						uniqueTraders24h: tokenAnalytics?.volume?.uniqueTraders24h || 0,
						swapCount24h: tokenAnalytics?.volume?.swapCount24h || 0,
						poolCount: token.poolCount,
						efficiency,
						volatility,
						momentum
					},
					chartData
				};
			});

			analytics = await Promise.all(analyticsPromises);
			calculateCorrelations();
		} catch (error) {
			console.error('Failed to load analytics:', error);
		} finally {
			loading = false;
		}
	}

	function calculateVolatility(chartData: any[]): number {
		// Mock volatility calculation - replace with actual price data analysis
		return Math.random() * 50 + 10;
	}

	function calculateCorrelations() {
		// Calculate correlation between tokens based on price movements
		// This is a simplified implementation - in production you'd use actual price data
		const correlations: { [key: string]: number } = {};
		
		for (let i = 0; i < analytics.length; i++) {
			for (let j = i + 1; j < analytics.length; j++) {
				const token1 = analytics[i];
				const token2 = analytics[j];
				const key = `${token1.symbol}-${token2.symbol}`;
				// Mock correlation - replace with actual calculation
				correlations[key] = (Math.random() * 2 - 1).toFixed(3) as any;
			}
		}
		
		correlationData = correlations;
	}

	function getBestPerformer(metricKey: string): TokenAnalytics | null {
		if (analytics.length === 0) return null;
		
		return analytics.reduce((best, current) => {
			const currentValue = current.metrics[metricKey as keyof typeof current.metrics] as number;
			const bestValue = best.metrics[metricKey as keyof typeof best.metrics] as number;
			
			return currentValue > bestValue ? current : best;
		});
	}

	function getWorstPerformer(metricKey: string): TokenAnalytics | null {
		if (analytics.length === 0) return null;
		
		return analytics.reduce((worst, current) => {
			const currentValue = current.metrics[metricKey as keyof typeof current.metrics] as number;
			const worstValue = worst.metrics[metricKey as keyof typeof worst.metrics] as number;
			
			return currentValue < worstValue ? current : worst;
		});
	}

	function getRelativePerformance(tokenAnalytics: TokenAnalytics, metricKey: string): {
		percentage: number;
		rank: number;
		total: number;
	} {
		const values = analytics.map(a => a.metrics[metricKey as keyof typeof a.metrics] as number);
		const maxValue = Math.max(...values);
		const currentValue = tokenAnalytics.metrics[metricKey as keyof typeof tokenAnalytics.metrics] as number;
		
		const sortedValues = [...values].sort((a, b) => b - a);
		const rank = sortedValues.findIndex(v => v === currentValue) + 1;
		
		return {
			percentage: maxValue > 0 ? (currentValue / maxValue) * 100 : 0,
			rank,
			total: analytics.length
		};
	}

	function removeToken(token: UniqueToken) {
		dispatch('removeToken', token);
	}

	function exportComparison(format: 'png' | 'pdf') {
		dispatch('export', { format });
	}

	function formatNumber(num: number): string {
		if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
		if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
		if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
		return num.toFixed(2);
	}

	function getColorForValue(value: number, isPositive: boolean = true): string {
		if (!isPositive) value = -value;
		
		if (value > 10) return 'text-green-600 dark:text-green-400';
		if (value > 5) return 'text-green-500 dark:text-green-300';
		if (value > 0) return 'text-yellow-600 dark:text-yellow-400';
		if (value > -5) return 'text-orange-600 dark:text-orange-400';
		return 'text-red-600 dark:text-red-400';
	}

	function getProgressBarWidth(value: number, maxValue: number): string {
		if (maxValue === 0) return '0%';
		return `${Math.min((value / maxValue) * 100, 100)}%`;
	}
</script>

<Card class="max-w-7xl mx-auto">
	<!-- Header -->
	<div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600">
		<div>
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white">
				Token Comparison
			</h2>
			<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
				Comparing {tokens.length} token{tokens.length !== 1 ? 's' : ''}
			</p>
		</div>

		<div class="flex items-center gap-2">
			{#if tokens.length < maxTokens}
				<Button size="sm" color="alternative" on:click={() => dispatch('addToken')}>
					<i class="fas fa-plus mr-2"></i>
					Add Token
				</Button>
			{/if}
			
			<Button size="sm" color="alternative" on:click={() => exportComparison('png')}>
				<i class="fas fa-download mr-2"></i>
				Export
			</Button>

			<Button size="sm" color="light" on:click={() => dispatch('close')}>
				<i class="fas fa-times"></i>
			</Button>
		</div>
	</div>

	<!-- Loading state -->
	{#if loading}
		<div class="flex items-center justify-center py-16" transition:fade>
			<div class="text-center">
				<i class="fas fa-spinner fa-spin text-3xl text-gray-400 mb-3"></i>
				<p class="text-gray-600 dark:text-gray-400">Loading comparison data...</p>
			</div>
		</div>

	<!-- Comparison content -->
	{:else if analytics.length > 0}
		<div class="p-6">
			<Tabs style="underline" bind:activeTabValue={selectedView}>
				<TabItem value="overview" title="Overview">
					<!-- Token cards grid -->
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-{Math.min(analytics.length, 4)} gap-4 mb-6">
						{#each analytics as token (token.tokenId)}
							<Card class="relative">
								<!-- Remove button -->
								<button
									type="button"
									class="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center text-xs z-10"
									on:click={() => removeToken(tokens.find(t => t.id === token.tokenId))}
								>
									<i class="fas fa-times"></i>
								</button>

								<!-- Token header -->
								<div class="flex items-center gap-3 mb-4">
									{#if token.imageUrl}
										<img src={token.imageUrl} alt="{token.symbol} logo" class="w-10 h-10 rounded-full" />
									{:else}
										<div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white font-bold">
											{token.symbol.slice(0, 2)}
										</div>
									{/if}
									
									<div>
										<h3 class="font-bold text-gray-900 dark:text-white">{token.symbol}</h3>
										<Badge class="text-xs">{token.type}</Badge>
									</div>
								</div>

								<!-- Key metrics -->
								<div class="space-y-3">
									<div class="flex justify-between items-center">
										<span class="text-sm text-gray-600 dark:text-gray-400">24h Volume</span>
										<span class="font-medium text-gray-900 dark:text-white">
											${formatNumber(token.metrics.volume24h)}
										</span>
									</div>

									<div class="flex justify-between items-center">
										<span class="text-sm text-gray-600 dark:text-gray-400">TVL</span>
										<span class="font-medium text-gray-900 dark:text-white">
											${formatNumber(token.metrics.tvl)}
										</span>
									</div>

									<div class="flex justify-between items-center">
										<span class="text-sm text-gray-600 dark:text-gray-400">24h Change</span>
										<span class="font-medium {getColorForValue(token.metrics.priceChange24h)}">
											{token.metrics.priceChange24h > 0 ? '+' : ''}{token.metrics.priceChange24h.toFixed(2)}%
										</span>
									</div>

									<div class="flex justify-between items-center">
										<span class="text-sm text-gray-600 dark:text-gray-400">Pools</span>
										<span class="font-medium text-gray-900 dark:text-white">
											{token.metrics.poolCount}
										</span>
									</div>
								</div>
							</Card>
						{/each}
					</div>

					<!-- Quick insights -->
					<div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
						<h4 class="font-semibold text-blue-900 dark:text-blue-100 mb-2">
							<i class="fas fa-lightbulb mr-2"></i>
							Quick Insights
						</h4>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
							<div>
								<span class="text-blue-700 dark:text-blue-300">Highest Volume:</span>
								<strong class="ml-1">{getBestPerformer('volume24h')?.symbol}</strong>
							</div>
							<div>
								<span class="text-blue-700 dark:text-blue-300">Highest TVL:</span>
								<strong class="ml-1">{getBestPerformer('tvl')?.symbol}</strong>
							</div>
							<div>
								<span class="text-blue-700 dark:text-blue-300">Best 24h Performance:</span>
								<strong class="ml-1">{getBestPerformer('priceChange24h')?.symbol}</strong>
							</div>
							<div>
								<span class="text-blue-700 dark:text-blue-300">Most Active:</span>
								<strong class="ml-1">{getBestPerformer('swapCount24h')?.symbol}</strong>
							</div>
						</div>
					</div>
				</TabItem>

				<TabItem value="metrics" title="Detailed Metrics">
					<div class="space-y-6">
						{#each comparisonMetrics as metric}
							<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
								<div class="flex items-center gap-2 mb-4">
									<i class="{metric.icon} text-gray-600 dark:text-gray-400"></i>
									<h4 class="font-semibold text-gray-900 dark:text-white">{metric.label}</h4>
									<p class="text-xs text-gray-500 dark:text-gray-400">{metric.description}</p>
								</div>

								<div class="space-y-3">
									{#each analytics as token (token.tokenId)}
										{@const performance = getRelativePerformance(token, metric.key)}
										{@const value = token.metrics[metric.key]}
										{@const maxValue = Math.max(...analytics.map(a => a.metrics[metric.key]))}
										
										<div class="flex items-center gap-4">
											<!-- Token info -->
											<div class="flex items-center gap-2 w-24 flex-shrink-0">
												{#if token.imageUrl}
													<img src={token.imageUrl} alt="{token.symbol} logo" class="w-6 h-6 rounded-full" />
												{:else}
													<div class="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-bold">
														{token.symbol.slice(0, 2)}
													</div>
												{/if}
												<span class="font-medium text-gray-900 dark:text-white text-sm">
													{token.symbol}
												</span>
											</div>

											<!-- Progress bar -->
											<div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4 relative">
												<div 
													class="h-4 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 flex items-center justify-end pr-2"
													style="width: {getProgressBarWidth(value, maxValue)}"
												>
													{#if performance.percentage > 30}
														<span class="text-white text-xs font-medium">
															#{performance.rank}
														</span>
													{/if}
												</div>
											</div>

											<!-- Value -->
											<div class="w-20 text-right">
												<span class="font-medium {metric.colorCoded ? getColorForValue(value, metric.higherIsBetter) : 'text-gray-900 dark:text-white'}">
													{metric.format(value)}
												</span>
											</div>

											<!-- Rank -->
											<div class="w-16 text-right text-sm text-gray-500 dark:text-gray-400">
												#{performance.rank}/{performance.total}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</TabItem>

				<TabItem value="correlation" title="Correlation Analysis">
					{#if Object.keys(correlationData).length > 0}
						<div class="space-y-4">
							<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
								Correlation coefficients between token price movements (-1 = perfect negative correlation, +1 = perfect positive correlation)
							</p>

							{#each Object.entries(correlationData) as [pair, correlation]}
								<div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
									<span class="font-medium text-gray-900 dark:text-white">{pair.replace('-', ' vs ')}</span>
									<div class="flex items-center gap-3">
										<div class="w-32 h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
											<div 
												class="h-full {correlation > 0.3 ? 'bg-green-500' : correlation < -0.3 ? 'bg-red-500' : 'bg-yellow-500'}"
												style="width: {Math.abs(correlation) * 100}%; margin-left: {correlation < 0 ? (1 - Math.abs(correlation)) * 100 : 0}%"
											></div>
										</div>
										<span class="font-mono text-sm {correlation > 0.3 ? 'text-green-600' : correlation < -0.3 ? 'text-red-600' : 'text-yellow-600'}">
											{correlation > 0 ? '+' : ''}{correlation}
										</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-center py-8">
							<i class="fas fa-chart-line text-4xl text-gray-400 mb-3"></i>
							<p class="text-gray-600 dark:text-gray-400">Need at least 2 tokens to show correlations</p>
						</div>
					{/if}
				</TabItem>
			</Tabs>
		</div>

	<!-- Empty state -->
	{:else}
		<div class="text-center py-16">
			<i class="fas fa-balance-scale text-4xl text-gray-400 mb-4"></i>
			<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
				No Tokens Selected
			</h3>
			<p class="text-gray-600 dark:text-gray-400 mb-4">
				Add some tokens to start comparing their performance
			</p>
			<Button color="purple" on:click={() => dispatch('addToken')}>
				<i class="fas fa-plus mr-2"></i>
				Add Tokens
			</Button>
		</div>
	{/if}
</Card>