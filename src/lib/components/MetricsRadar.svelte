<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { fade, draw } from 'svelte/transition';
	import { Card, Button, Badge, Select, Toggle } from 'flowbite-svelte';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		tokenHover: UniqueToken | null;
		tokenSelect: UniqueToken;
		metricSelect: string;
	}>();

	export let tokens: any[] = [];
	export let selectedTokens: UniqueToken[] = [];
	export let maxTokens = 5;
	export let size = 400;
	export let animated = true;

	interface RadarMetric {
		key: string;
		label: string;
		max: number;
		format: (value: number) => string;
		description: string;
		higherIsBetter: boolean;
	}

	interface TokenRadarData {
		token: UniqueToken;
		color: string;
		values: { [key: string]: number };
		normalizedValues: { [key: string]: number };
		visible: boolean;
	}

	let svgElement: SVGElement;
	let hoveredToken: TokenRadarData | null = null;
	let hoveredMetric: string | null = null;
	let showGrid = true;
	let showLabels = true;
	let showValues = false;
	let gridLevels = 5;

	// Define radar metrics
	const radarMetrics: RadarMetric[] = [
		{
			key: 'volume24h',
			label: 'Volume (24h)',
			max: 1000000,
			format: (v) => `$${formatNumber(v)}`,
			description: '24-hour trading volume',
			higherIsBetter: true
		},
		{
			key: 'tvl',
			label: 'TVL',
			max: 5000000,
			format: (v) => `$${formatNumber(v)}`,
			description: 'Total Value Locked',
			higherIsBetter: true
		},
		{
			key: 'priceChange24h',
			label: 'Price Change',
			max: 50,
			format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`,
			description: '24-hour price change percentage',
			higherIsBetter: true
		},
		{
			key: 'uniqueTraders24h',
			label: 'Traders',
			max: 1000,
			format: (v) => formatNumber(v),
			description: 'Unique traders in 24 hours',
			higherIsBetter: true
		},
		{
			key: 'poolCount',
			label: 'Pools',
			max: 20,
			format: (v) => v.toString(),
			description: 'Number of active pools',
			higherIsBetter: true
		},
		{
			key: 'efficiency',
			label: 'Efficiency',
			max: 100,
			format: (v) => `${v.toFixed(1)}%`,
			description: 'Volume per swap efficiency',
			higherIsBetter: true
		}
	];

	// Color palette for different tokens
	const tokenColors = [
		'#8b5cf6', // Purple
		'#3b82f6', // Blue
		'#10b981', // Emerald
		'#f59e0b', // Amber
		'#ef4444', // Red
		'#06b6d4', // Cyan
		'#8b5cf6', // Purple variant
		'#f97316'  // Orange
	];

	let tokenRadarData: TokenRadarData[] = [];

	// Reactive data processing
	$: if (selectedTokens.length > 0) {
		processTokenData();
	}

	// Chart dimensions and positioning
	$: center = size / 2;
	$: radius = (size * 0.8) / 2;
	$: angleStep = (2 * Math.PI) / radarMetrics.length;

	async function processTokenData() {
		const processedData = await Promise.allSettled(
			selectedTokens.slice(0, maxTokens).map(async (token, index) => {
				// Load analytics for each token
				let analytics = null;
				try {
					const response = await fetch(`/api/token-analytics?tokenId=${token.id}`);
					const data = await response.json();
					if (data.success) {
						analytics = data.analytics;
					}
				} catch (error) {
					console.error(`Failed to load analytics for ${token.symbol}:`, error);
				}

				// Create metrics values
				const values: { [key: string]: number } = {};
				const normalizedValues: { [key: string]: number } = {};

				radarMetrics.forEach(metric => {
					let value = 0;

					switch (metric.key) {
						case 'volume24h':
							value = analytics?.volume?.volume24h || 0;
							break;
						case 'tvl':
							value = analytics?.liquidity?.totalTvlUsd || 0;
							break;
						case 'priceChange24h':
							value = Math.random() * 40 - 20; // Mock data
							break;
						case 'uniqueTraders24h':
							value = analytics?.volume?.uniqueTraders24h || 0;
							break;
						case 'poolCount':
							value = token.poolCount || 0;
							break;
						case 'efficiency':
							const volume = analytics?.volume?.volume24h || 0;
							const swaps = analytics?.volume?.swapCount24h || 1;
							value = swaps > 0 ? Math.min((volume / swaps) / 10000 * 100, 100) : 0;
							break;
					}

					values[metric.key] = value;
					// Normalize to 0-1 range
					normalizedValues[metric.key] = Math.min(Math.max(value / metric.max, 0), 1);
				});

				return {
					token,
					color: tokenColors[index % tokenColors.length],
					values,
					normalizedValues,
					visible: true
				};
			})
		);

		tokenRadarData = processedData
			.filter((result): result is PromiseFulfilledResult<TokenRadarData> => 
				result.status === 'fulfilled'
			)
			.map(result => result.value);
	}

	function getPointCoordinates(metricIndex: number, normalizedValue: number): { x: number; y: number } {
		const angle = metricIndex * angleStep - Math.PI / 2; // Start from top
		const distance = normalizedValue * radius;
		
		return {
			x: center + Math.cos(angle) * distance,
			y: center + Math.sin(angle) * distance
		};
	}

	function getLabelCoordinates(metricIndex: number): { x: number; y: number } {
		const angle = metricIndex * angleStep - Math.PI / 2;
		const distance = radius + 30;
		
		return {
			x: center + Math.cos(angle) * distance,
			y: center + Math.sin(angle) * distance
		};
	}

	function generateRadarPath(tokenData: TokenRadarData): string {
		if (!tokenData.visible) return '';

		const points = radarMetrics.map((metric, index) => {
			const value = tokenData.normalizedValues[metric.key] || 0;
			return getPointCoordinates(index, value);
		});

		if (points.length === 0) return '';

		let path = `M ${points[0].x} ${points[0].y}`;
		for (let i = 1; i < points.length; i++) {
			path += ` L ${points[i].x} ${points[i].y}`;
		}
		path += ' Z'; // Close the path

		return path;
	}

	function generateGridPath(level: number): string {
		const distance = (radius * level) / gridLevels;
		const points = radarMetrics.map((_, index) => {
			const angle = index * angleStep - Math.PI / 2;
			return {
				x: center + Math.cos(angle) * distance,
				y: center + Math.sin(angle) * distance
			};
		});

		if (points.length === 0) return '';

		let path = `M ${points[0].x} ${points[0].y}`;
		for (let i = 1; i < points.length; i++) {
			path += ` L ${points[i].x} ${points[i].y}`;
		}
		path += ' Z';

		return path;
	}

	function handleTokenToggle(tokenData: TokenRadarData) {
		tokenData.visible = !tokenData.visible;
		tokenRadarData = tokenRadarData; // Trigger reactivity
	}

	function handleMetricHover(metricKey: string | null) {
		hoveredMetric = metricKey;
		if (metricKey) {
			dispatch('metricSelect', metricKey);
		}
	}

	function formatNumber(num: number): string {
		if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
		if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
		if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
		return num.toFixed(0);
	}

	function getTextAnchor(metricIndex: number): string {
		const angle = metricIndex * angleStep - Math.PI / 2;
		const x = Math.cos(angle);
		
		if (x > 0.1) return 'start';
		if (x < -0.1) return 'end';
		return 'middle';
	}

	function getDominantY(metricIndex: number): string {
		const angle = metricIndex * angleStep - Math.PI / 2;
		const y = Math.sin(angle);
		
		if (y > 0.1) return 'hanging';
		if (y < -0.1) return 'auto';
		return 'central';
	}
</script>

<Card class="p-6">
	<!-- Header -->
	<div class="flex items-center justify-between mb-6">
		<div>
			<h3 class="text-xl font-bold text-gray-900 dark:text-white">
				Token Metrics Radar
			</h3>
			<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
				Multi-dimensional performance comparison
			</p>
		</div>

		<div class="flex items-center gap-4">
			<!-- Display options -->
			<div class="flex items-center gap-3">
				<label class="flex items-center gap-2">
					<Toggle bind:checked={showGrid} size="sm" />
					<span class="text-sm text-gray-600 dark:text-gray-400">Grid</span>
				</label>
				<label class="flex items-center gap-2">
					<Toggle bind:checked={showLabels} size="sm" />
					<span class="text-sm text-gray-600 dark:text-gray-400">Labels</span>
				</label>
				<label class="flex items-center gap-2">
					<Toggle bind:checked={showValues} size="sm" />
					<span class="text-sm text-gray-600 dark:text-gray-400">Values</span>
				</label>
			</div>
		</div>
	</div>

	<div class="flex gap-6">
		<!-- Radar chart -->
		<div class="flex-1">
			{#if tokenRadarData.length > 0}
				<div class="relative">
					<svg 
						bind:this={svgElement}
						width={size} 
						height={size} 
						viewBox="0 0 {size} {size}"
						class="w-full max-w-md mx-auto"
					>
						<!-- Background grid -->
						{#if showGrid}
							<!-- Grid circles -->
							{#each Array(gridLevels) as _, level}
								<path
									d={generateGridPath(level + 1)}
									fill="none"
									stroke="currentColor"
									stroke-width="1"
									class="text-gray-200 dark:text-gray-700"
									opacity="0.5"
								/>
							{/each}

							<!-- Axis lines -->
							{#each radarMetrics as _, index}
								{@const labelCoords = getLabelCoordinates(index)}
								<line
									x1={center}
									y1={center}
									x2={labelCoords.x - (labelCoords.x - center) * 0.15}
									y2={labelCoords.y - (labelCoords.y - center) * 0.15}
									stroke="currentColor"
									stroke-width="1"
									class="text-gray-300 dark:text-gray-600"
									opacity="0.7"
								/>
							{/each}
						{/if}

						<!-- Token radar areas -->
						{#each tokenRadarData as tokenData, tokenIndex (tokenData.token.id)}
							{#if tokenData.visible}
								<!-- Filled area -->
								<path
									d={generateRadarPath(tokenData)}
									fill={tokenData.color}
									fill-opacity="0.1"
									stroke={tokenData.color}
									stroke-width="2"
									class="hover:fill-opacity-20 transition-all duration-200 cursor-pointer"
									on:mouseenter={() => hoveredToken = tokenData}
									on:mouseleave={() => hoveredToken = null}
									on:click={() => dispatch('tokenSelect', tokenData.token)}
									in:draw={animated ? { duration: 800, delay: tokenIndex * 100 } : undefined}
								/>

								<!-- Data points -->
								{#each radarMetrics as metric, metricIndex}
									{@const coords = getPointCoordinates(metricIndex, tokenData.normalizedValues[metric.key] || 0)}
									<circle
										cx={coords.x}
										cy={coords.y}
										r="4"
										fill={tokenData.color}
										stroke="white"
										stroke-width="2"
										class="hover:r-6 transition-all duration-200 cursor-pointer"
										on:mouseenter={() => {
											hoveredToken = tokenData;
											handleMetricHover(metric.key);
										}}
										on:mouseleave={() => {
											hoveredToken = null;
											handleMetricHover(null);
										}}
									>
										<title>
											{tokenData.token.symbol} - {metric.label}: {metric.format(tokenData.values[metric.key] || 0)}
										</title>
									</circle>

									<!-- Value labels -->
									{#if showValues && tokenData.visible}
										<text
											x={coords.x}
											y={coords.y - 10}
											text-anchor="middle"
											class="text-xs font-medium fill-current text-gray-700 dark:text-gray-300 pointer-events-none"
										>
											{metric.format(tokenData.values[metric.key] || 0)}
										</text>
									{/if}
								{/each}
							{/if}
						{/each}

						<!-- Metric labels -->
						{#if showLabels}
							{#each radarMetrics as metric, index}
								{@const labelCoords = getLabelCoordinates(index)}
								<text
									x={labelCoords.x}
									y={labelCoords.y}
									text-anchor={getTextAnchor(index)}
									dominant-baseline={getDominantY(index)}
									class="text-sm font-medium fill-current text-gray-700 dark:text-gray-300 cursor-pointer hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
									on:mouseenter={() => handleMetricHover(metric.key)}
									on:mouseleave={() => handleMetricHover(null)}
								>
									{metric.label}
								</text>
							{/each}
						{/if}
					</svg>

					<!-- Tooltip -->
					{#if hoveredToken && hoveredMetric}
						{@const metric = radarMetrics.find(m => m.key === hoveredMetric)}
						{#if metric}
							<div 
								class="absolute top-4 right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-3 shadow-lg z-10"
								transition:fade={{ duration: 150 }}
							>
								<div class="flex items-center gap-2 mb-2">
									<div 
										class="w-3 h-3 rounded-full"
										style="background-color: {hoveredToken.color}"
									></div>
									<span class="font-semibold text-gray-900 dark:text-white">
										{hoveredToken.token.symbol}
									</span>
								</div>
								<div class="text-sm">
									<div class="font-medium text-gray-700 dark:text-gray-300">
										{metric.label}
									</div>
									<div class="text-lg font-bold text-gray-900 dark:text-white">
										{metric.format(hoveredToken.values[metric.key] || 0)}
									</div>
									<div class="text-xs text-gray-500 dark:text-gray-400">
										{metric.description}
									</div>
								</div>
							</div>
						{/if}
					{/if}
				</div>

			{:else}
				<div class="flex items-center justify-center h-96" transition:fade>
					<div class="text-center">
						<i class="fas fa-chart-area text-4xl text-gray-400 mb-4"></i>
						<h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
							No Tokens Selected
						</h4>
						<p class="text-gray-600 dark:text-gray-400">
							Add tokens to see their performance radar chart
						</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Token legend and controls -->
		<div class="w-64 space-y-4">
			<!-- Token list -->
			{#if tokenRadarData.length > 0}
				<div>
					<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
						Tokens ({tokenRadarData.length})
					</h4>
					<div class="space-y-2">
						{#each tokenRadarData as tokenData (tokenData.token.id)}
							<div 
								class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
								on:click={() => handleTokenToggle(tokenData)}
							>
								<div class="flex items-center gap-2">
									<input 
										type="checkbox" 
										bind:checked={tokenData.visible}
										class="rounded"
									/>
									<div 
										class="w-4 h-4 rounded-full border-2 border-white"
										style="background-color: {tokenData.color}"
									></div>
								</div>
								
								<div class="flex-1 min-w-0">
									<div class="font-medium text-gray-900 dark:text-white">
										{tokenData.token.symbol}
									</div>
									<div class="text-xs text-gray-500 dark:text-gray-400">
										{tokenData.token.type}
									</div>
								</div>

								<button
									type="button"
									class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
									on:click|stopPropagation={() => dispatch('tokenSelect', tokenData.token)}
								>
									<i class="fas fa-external-link-alt text-xs"></i>
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Metrics legend -->
			<div>
				<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
					Metrics
				</h4>
				<div class="space-y-2">
					{#each radarMetrics as metric}
						<div 
							class="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer {
								hoveredMetric === metric.key ? 'bg-purple-50 dark:bg-purple-900/20' : ''
							}"
							on:mouseenter={() => handleMetricHover(metric.key)}
							on:mouseleave={() => handleMetricHover(null)}
						>
							<div class="font-medium text-gray-900 dark:text-white text-sm">
								{metric.label}
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400">
								{metric.description}
							</div>
							<div class="text-xs text-gray-400 dark:text-gray-500 mt-1">
								Max: {metric.format(metric.max)}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Performance summary -->
			{#if hoveredToken}
				<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3" transition:fade>
					<h5 class="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
						<div 
							class="w-3 h-3 rounded-full"
							style="background-color: {hoveredToken.color}"
						></div>
						{hoveredToken.token.symbol}
					</h5>
					<div class="space-y-1 text-sm">
						{#each radarMetrics as metric}
							<div class="flex justify-between">
								<span class="text-gray-600 dark:text-gray-400">
									{metric.label}:
								</span>
								<span class="font-medium text-gray-900 dark:text-white">
									{metric.format(hoveredToken.values[metric.key] || 0)}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</Card>