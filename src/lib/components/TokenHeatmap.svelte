<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { Card, Button, Badge, Tooltip } from 'flowbite-svelte';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		tokenSelect: UniqueToken;
		tokenHover: UniqueToken | null;
		compare: UniqueToken[];
	}>();

	export let tokens: any[] = [];
	export let loading = false;
	export let metric: 'volume24h' | 'tvl' | 'priceChange24h' | 'marketCap' = 'volume24h';
	export let selectedTokens: UniqueToken[] = [];
	export let maxItems = 100;

	interface HeatmapToken {
		id: number;
		symbol: string;
		type: string;
		decimals: number;
		poolCount: number;
		metrics: {
			volume24h: number;
			volume7d: number;
			tvl: number;
			priceChange24h: number;
			priceChange7d: number;
			marketCap?: number;
			uniqueTraders24h?: number;
			swapCount24h?: number;
		};
		analytics?: any;
		imageUrl?: string;
	}

	let heatmapTokens: HeatmapToken[] = [];
	let hoveredToken: HeatmapToken | null = null;
	let containerRef: HTMLDivElement;
	let colorScale: { min: number; max: number } = { min: 0, max: 100 };

	// Metric configurations
	const metricConfigs = {
		volume24h: {
			label: '24h Volume',
			icon: 'fas fa-chart-bar',
			color: 'blue',
			format: (value: number) => `$${formatNumber(value)}`,
			description: 'Trading volume in the last 24 hours'
		},
		tvl: {
			label: 'Total Value Locked',
			icon: 'fas fa-lock',
			color: 'green',
			format: (value: number) => `$${formatNumber(value)}`,
			description: 'Total value locked in liquidity pools'
		},
		priceChange24h: {
			label: '24h Price Change',
			icon: 'fas fa-arrow-trend-up',
			color: 'purple',
			format: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`,
			description: 'Price change percentage in the last 24 hours'
		},
		marketCap: {
			label: 'Market Cap',
			icon: 'fas fa-coins',
			color: 'orange',
			format: (value: number) => `$${formatNumber(value)}`,
			description: 'Total market capitalization'
		}
	};

	onMount(() => {
		loadTokenAnalytics();
	});

	// Reactive updates when tokens or metric changes
	$: if (tokens.length > 0) {
		updateHeatmapData();
	}

	$: currentConfig = metricConfigs[metric];

	async function loadTokenAnalytics() {
		if (tokens.length === 0) return;

		const tokenAnalytics = await Promise.allSettled(
			tokens.slice(0, maxItems).map(async (token) => {
				try {
					const response = await fetch(`/api/token-analytics?tokenId=${token.id}`);
					const data = await response.json();
					return {
						...token,
						analytics: data.success ? data.analytics : null
					};
				} catch (error) {
					return { ...token, analytics: null };
				}
			})
		);

		heatmapTokens = tokenAnalytics
			.filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
			.map((result) => result.value)
			.map((token) => ({
				id: token.id,
				symbol: token.symbol,
				type: token.type,
				decimals: token.decimals,
				poolCount: token.poolCount,
				imageUrl: token.imageUrl,
				metrics: {
					volume24h: token.analytics?.volume?.volume24h || 0,
					volume7d: token.analytics?.volume?.volume7d || 0,
					tvl: token.analytics?.liquidity?.totalTvlUsd || 0,
					priceChange24h: Math.random() * 40 - 20, // Mock data - replace with real data
					priceChange7d: Math.random() * 60 - 30, // Mock data - replace with real data
					marketCap: token.analytics?.liquidity?.totalTvlUsd * (Math.random() * 10 + 1), // Mock calculation
					uniqueTraders24h: token.analytics?.volume?.uniqueTraders24h || 0,
					swapCount24h: token.analytics?.volume?.swapCount24h || 0
				},
				analytics: token.analytics
			}));

		updateColorScale();
	}

	function updateHeatmapData() {
		// This will be called when tokens prop changes
		if (heatmapTokens.length === 0) {
			loadTokenAnalytics();
		}
	}

	function updateColorScale() {
		if (heatmapTokens.length === 0) return;

		const values = heatmapTokens.map((token) => token.metrics[metric]).filter((v) => v != null);
		colorScale = {
			min: Math.min(...values),
			max: Math.max(...values)
		};
	}

	function getTokenSize(token: HeatmapToken): string {
		// Size based on TVL or market cap
		const sizeMetric = token.metrics.tvl || token.metrics.marketCap || 0;
		const maxSize = Math.max(
			...heatmapTokens.map((t) => t.metrics.tvl || t.metrics.marketCap || 0)
		);

		if (maxSize === 0) return 'w-20 h-20';

		const ratio = sizeMetric / maxSize;

		if (ratio > 0.8) return 'w-24 h-24';
		if (ratio > 0.6) return 'w-20 h-20';
		if (ratio > 0.4) return 'w-16 h-16';
		if (ratio > 0.2) return 'w-14 h-14';
		return 'w-12 h-12';
	}

	function getTokenColor(token: HeatmapToken): string {
		const value = token.metrics[metric];
		const { min, max } = colorScale;

		if (max === min) return 'bg-gray-400';

		const ratio = (value - min) / (max - min);

		// Color based on metric type
		if (metric === 'priceChange24h') {
			if (ratio > 0.8) return 'bg-green-500';
			if (ratio > 0.6) return 'bg-green-400';
			if (ratio > 0.4) return 'bg-yellow-400';
			if (ratio > 0.2) return 'bg-orange-400';
			return 'bg-red-400';
		} else {
			// For volume, TVL, market cap - higher is better
			if (ratio > 0.8) return 'bg-blue-500';
			if (ratio > 0.6) return 'bg-blue-400';
			if (ratio > 0.4) return 'bg-purple-400';
			if (ratio > 0.2) return 'bg-indigo-400';
			return 'bg-gray-400';
		}
	}

	function getTokenOpacity(token: HeatmapToken): string {
		const value = token.metrics[metric];
		const { min, max } = colorScale;

		if (max === min) return 'opacity-50';

		const ratio = (value - min) / (max - min);
		return `opacity-${Math.max(Math.floor(ratio * 100), 30)}`;
	}

	function handleTokenClick(token: HeatmapToken) {
		const uniqueToken: UniqueToken = {
			id: token.id,
			symbol: token.symbol,
			type: token.type as any,
			decimals: token.decimals,
			poolCount: token.poolCount
		};

		if (selectedTokens.find((t) => t.id === token.id)) {
			// If already selected and we have multiple, start comparison
			if (selectedTokens.length > 1) {
				dispatch('compare', selectedTokens);
			}
		} else {
			dispatch('tokenSelect', uniqueToken);
		}
	}

	function handleTokenHover(token: HeatmapToken | null) {
		hoveredToken = token;
		dispatch(
			'tokenHover',
			token
				? {
						id: token.id,
						symbol: token.symbol,
						type: token.type as any,
						decimals: token.decimals,
						poolCount: token.poolCount
					}
				: null
		);
	}

	function isSelected(token: HeatmapToken): boolean {
		return selectedTokens.some((t) => t.id === token.id);
	}

	function formatNumber(num: number): string {
		if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
		if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
		if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
		return num.toFixed(2);
	}

	function getTypeIcon(type: string): string {
		switch (type?.toUpperCase()) {
			case 'ARC200':
				return 'fas fa-layer-group';
			case 'ASA':
				return 'fas fa-cube';
			case 'VOI':
				return 'fas fa-star';
			default:
				return 'fas fa-coins';
		}
	}

	function getTypeColor(type: string): string {
		switch (type?.toUpperCase()) {
			case 'ARC200':
				return 'text-blue-600';
			case 'ASA':
				return 'text-green-600';
			case 'VOI':
				return 'text-purple-600';
			default:
				return 'text-gray-600';
		}
	}
</script>

<Card class="p-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
		<div>
			<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">
				Token Performance Heatmap
			</h3>
			<p class="text-sm text-gray-600 dark:text-gray-400">
				Visual overview of token performance. Size = TVL, Color = {currentConfig.label.toLowerCase()}
			</p>
		</div>

		<!-- Metric selector -->
		<div class="mt-4 sm:mt-0">
			<div class="flex items-center gap-2">
				<span class="text-sm text-gray-600 dark:text-gray-400">Metric:</span>
				<div class="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
					{#each Object.entries(metricConfigs) as [key, config]}
						<button
							type="button"
							class="px-3 py-1 text-xs font-medium rounded-md transition-colors {metric === key
								? `bg-${config.color}-500 text-white`
								: 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}"
							on:click={() => {
								metric = key as any;
								updateColorScale();
							}}
						>
							<i class="{config.icon} mr-1"></i>
							{config.label}
						</button>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Loading state -->
	{#if loading}
		<div class="flex items-center justify-center py-16" transition:fade>
			<div class="text-center">
				<i class="fas fa-spinner fa-spin text-3xl text-gray-400 mb-3"></i>
				<p class="text-gray-600 dark:text-gray-400">Loading token data...</p>
			</div>
		</div>

		<!-- Heatmap grid -->
	{:else if heatmapTokens.length > 0}
		<div class="relative">
			<!-- Color scale legend -->
			<div class="flex items-center justify-between mb-4 text-xs text-gray-500 dark:text-gray-400">
				<div class="flex items-center gap-2">
					<span>Low</span>
					<div class="flex gap-1">
						<div class="w-4 h-4 bg-gray-400 rounded"></div>
						<div class="w-4 h-4 bg-indigo-400 rounded"></div>
						<div class="w-4 h-4 bg-purple-400 rounded"></div>
						<div class="w-4 h-4 bg-blue-400 rounded"></div>
						<div class="w-4 h-4 bg-blue-500 rounded"></div>
					</div>
					<span>High</span>
				</div>
				<div class="text-right">
					<span
						>{currentConfig.format(colorScale.min)} - {currentConfig.format(colorScale.max)}</span
					>
				</div>
			</div>

			<!-- Heatmap grid -->
			<div
				bind:this={containerRef}
				class="flex flex-wrap gap-2 justify-center max-h-96 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
			>
				{#each heatmapTokens as token (token.id)}
					<button
						type="button"
						class="relative flex flex-col items-center justify-center rounded-lg transition-all duration-200 hover:scale-110 hover:z-10 focus:outline-none focus:ring-2 focus:ring-purple-500 {getTokenSize(
							token
						)} {getTokenColor(token)} {getTokenOpacity(token)} {isSelected(token)
							? 'ring-2 ring-purple-500 ring-offset-2'
							: ''}"
						on:click={() => handleTokenClick(token)}
						on:mouseenter={() => handleTokenHover(token)}
						on:mouseleave={() => handleTokenHover(null)}
						transition:scale={{ duration: 200 }}
					>
						<!-- Token icon/image -->
						<div class="mb-1">
							{#if token.imageUrl}
								<img
									src={token.imageUrl}
									alt="{token.symbol} logo"
									class="w-6 h-6 rounded-full"
									on:error={(e) => (e.currentTarget.style.display = 'none')}
								/>
							{:else}
								<i
									class="{getTypeIcon(token.type)} {getTypeColor(
										token.type
									)} text-white text-lg drop-shadow-sm"
								></i>
							{/if}
						</div>

						<!-- Token symbol -->
						<div class="text-xs font-bold text-white drop-shadow-sm text-center">
							{token.symbol}
						</div>

						<!-- Metric value -->
						<div class="text-xs text-white/90 drop-shadow-sm">
							{currentConfig.format(token.metrics[metric])}
						</div>

						<!-- Selection indicator -->
						{#if isSelected(token)}
							<div
								class="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center"
							>
								<i class="fas fa-check text-white text-xs"></i>
							</div>
						{/if}

						<!-- Hover tooltip trigger -->
						{#if hoveredToken?.id === token.id}
							<div class="absolute inset-0 pointer-events-none"></div>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Hover tooltip -->
			{#if hoveredToken}
				<div
					class="fixed z-50 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl pointer-events-none"
					style="left: 50%; top: 50%; transform: translate(-50%, -50%);"
					transition:fade={{ duration: 150 }}
				>
					<div class="flex items-start gap-3">
						{#if hoveredToken.imageUrl}
							<img
								src={hoveredToken.imageUrl}
								alt="{hoveredToken.symbol} logo"
								class="w-10 h-10 rounded-full"
							/>
						{:else}
							<div
								class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center"
							>
								<i class="{getTypeIcon(hoveredToken.type)} text-white"></i>
							</div>
						{/if}

						<div class="flex-1">
							<div class="flex items-center gap-2 mb-2">
								<h4 class="font-bold text-gray-900 dark:text-white">
									{hoveredToken.symbol}
								</h4>
								<Badge
									class="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
								>
									{hoveredToken.type}
								</Badge>
							</div>

							<div class="grid grid-cols-2 gap-3 text-sm">
								<div>
									<span class="text-gray-500 dark:text-gray-400">24h Volume:</span>
									<p class="font-medium text-gray-900 dark:text-white">
										${formatNumber(hoveredToken.metrics.volume24h)}
									</p>
								</div>
								<div>
									<span class="text-gray-500 dark:text-gray-400">TVL:</span>
									<p class="font-medium text-gray-900 dark:text-white">
										${formatNumber(hoveredToken.metrics.tvl)}
									</p>
								</div>
								<div>
									<span class="text-gray-500 dark:text-gray-400">24h Change:</span>
									<p
										class="font-medium {hoveredToken.metrics.priceChange24h > 0
											? 'text-green-600'
											: 'text-red-600'}"
									>
										{hoveredToken.metrics.priceChange24h > 0
											? '+'
											: ''}{hoveredToken.metrics.priceChange24h.toFixed(2)}%
									</p>
								</div>
								<div>
									<span class="text-gray-500 dark:text-gray-400">Pools:</span>
									<p class="font-medium text-gray-900 dark:text-white">
										{hoveredToken.poolCount}
									</p>
								</div>
							</div>

							{#if hoveredToken.metrics.uniqueTraders24h}
								<div
									class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400"
								>
									{hoveredToken.metrics.uniqueTraders24h} traders • {hoveredToken.metrics
										.swapCount24h} swaps (24h)
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Empty state -->
	{:else}
		<div class="text-center py-16" transition:fade>
			<i class="fas fa-chart-area text-4xl text-gray-400 mb-4"></i>
			<h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
				No Token Data Available
			</h4>
			<p class="text-gray-600 dark:text-gray-400">
				Load some tokens to see the performance heatmap
			</p>
		</div>
	{/if}
</Card>

<style>
	.opacity-30 {
		opacity: 0.3;
	}
	.opacity-50 {
		opacity: 0.5;
	}
	.opacity-70 {
		opacity: 0.7;
	}
	.opacity-90 {
		opacity: 0.9;
	}
</style>
