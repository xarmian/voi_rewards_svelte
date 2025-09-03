<script lang="ts">
	import { Card, Spinner } from 'flowbite-svelte';
	import type { TokenPair } from '$lib/types/ohlcv.types';

	export let selectedPool: TokenPair | null = null;

	let poolAnalytics: any = null;
	let loading = false;
	let error: string | null = null;

	// Fetch pool analytics when pool changes
	$: if (selectedPool?.poolId) {
		fetchPoolAnalytics(selectedPool.poolId);
	}

	async function fetchPoolAnalytics(poolId: number) {
		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/pool-analytics?poolId=${poolId}`);
			const data = await response.json();

			if (data.success) {
				poolAnalytics = data.analytics;
			} else {
				error = data.error || 'Failed to load pool data';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Network error';
		} finally {
			loading = false;
		}
	}

	// Format numbers
	const formatCurrency = (num: number | null | undefined): string => {
		if (num === null || num === undefined || num === 0) return '-';
		return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
	};

	const formatNumber = (num: number | null | undefined, decimals: number = 0): string => {
		if (num === null || num === undefined) return '-';
		return num.toLocaleString('en-US', {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals
		});
	};

	const formatBalance = (balance: string | number, symbol: string): string => {
		const num = typeof balance === 'string' ? parseFloat(balance) : balance;
		if (isNaN(num)) return '-';
		return `${formatNumber(num, 2)} ${symbol}`;
	};

	const formatPercentage = (num: number | null | undefined): string => {
		if (num === null || num === undefined) return '-';
		return `${num.toFixed(2)}%`;
	};

	const formatAddress = (address: string): string => {
		if (!address || address.length < 10) return address;
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	};
</script>

{#if selectedPool && poolAnalytics}
	<div class="bg-white dark:bg-gray-800 shadow-md rounded-xl p-6 mb-6">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h3 class="text-xl font-bold text-gray-900 dark:text-white">
					{poolAnalytics.tokenA.symbol}/{poolAnalytics.tokenB.symbol} Pool Details
				</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Pool ID: {poolAnalytics.poolId}
				</p>
			</div>

			{#if loading}
				<Spinner size="6" />
			{/if}
		</div>

		{#if error}
			<div
				class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4"
			>
				<p class="text-red-800 dark:text-red-200 text-sm">{error}</p>
			</div>
		{:else}
			<!-- Pool Composition -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
				<!-- Token A Info -->
				<Card
					class="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-600"
				>
					<div class="text-center">
						<div class="text-sm text-gray-500 dark:text-gray-400 mb-1">
							{poolAnalytics.tokenA.symbol} ({poolAnalytics.tokenA.type})
						</div>
						<div class="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-2">
							{formatBalance(poolAnalytics.liquidity.reserveA, poolAnalytics.tokenA.symbol)}
						</div>
						<div class="text-xs text-gray-600 dark:text-gray-300">
							24h Volume: {formatBalance(
								poolAnalytics.volume.volumeTokenA24h,
								poolAnalytics.tokenA.symbol
							)}
						</div>
					</div>
				</Card>

				<!-- Token B Info -->
				<Card
					class="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-gray-700 dark:to-gray-600"
				>
					<div class="text-center">
						<div class="text-sm text-gray-500 dark:text-gray-400 mb-1">
							{poolAnalytics.tokenB.symbol} ({poolAnalytics.tokenB.type})
						</div>
						<div class="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
							{formatBalance(poolAnalytics.liquidity.reserveB, poolAnalytics.tokenB.symbol)}
						</div>
						<div class="text-xs text-gray-600 dark:text-gray-300">
							24h Volume: {formatBalance(
								poolAnalytics.volume.volumeTokenB24h,
								poolAnalytics.tokenB.symbol
							)}
						</div>
					</div>
				</Card>
			</div>

			<!-- Pool Metrics Grid -->
			<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
				<!-- Price Ratio -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						Price Ratio
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatNumber(poolAnalytics.metrics.priceRatio, 6)}
					</div>
					<div class="text-xs text-gray-500 dark:text-gray-400">
						{poolAnalytics.tokenB.symbol}/{poolAnalytics.tokenA.symbol}
					</div>
				</div>

				<!-- 24h Volume -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						24h Volume
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatNumber(poolAnalytics.volume.volume24h)}
					</div>
				</div>

				<!-- 7d Volume -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						7d Volume
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatNumber(poolAnalytics.volume.volume7d)}
					</div>
				</div>

				<!-- 24h Swaps -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						24h Swaps
					</div>
					<div class="text-lg font-bold text-purple-600 dark:text-purple-400">
						{formatNumber(poolAnalytics.metrics.swapCount24h)}
					</div>
				</div>

				<!-- Unique Traders -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						Unique Traders
					</div>
					<div class="text-lg font-bold text-indigo-600 dark:text-indigo-400">
						{formatNumber(poolAnalytics.metrics.uniqueTraders24h)}
					</div>
				</div>

				<!-- LP Token Supply -->
				<div class="text-center">
					<div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
						LP Tokens
					</div>
					<div class="text-lg font-bold text-gray-900 dark:text-white">
						{formatNumber(poolAnalytics.liquidity.lpTokenSupply)}
					</div>
				</div>
			</div>

			<!-- Pool Information -->
			<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
				<h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
					Pool Information
				</h4>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
					<div>
						<span class="text-gray-500 dark:text-gray-400">Escrow Address:</span>
						<div class="font-mono text-gray-900 dark:text-white break-all">
							{poolAnalytics.escrowAddress}
						</div>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">Pool Composition:</span>
						<div class="text-gray-900 dark:text-white">
							{(
								(poolAnalytics.liquidity.reserveA /
									(poolAnalytics.liquidity.reserveA + poolAnalytics.liquidity.reserveB)) *
								100
							).toFixed(1)}% {poolAnalytics.tokenA.symbol} /
							{(
								(poolAnalytics.liquidity.reserveB /
									(poolAnalytics.liquidity.reserveA + poolAnalytics.liquidity.reserveB)) *
								100
							).toFixed(1)}% {poolAnalytics.tokenB.symbol}
						</div>
					</div>
					{#if poolAnalytics.metrics.averageFee}
						<div>
							<span class="text-gray-500 dark:text-gray-400">Average Fee:</span>
							<div class="text-gray-900 dark:text-white">
								{formatPercentage(poolAnalytics.metrics.averageFee)}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{:else if loading}
	<div class="bg-white dark:bg-gray-800 shadow-md rounded-xl p-6 mb-6">
		<div class="flex items-center justify-center py-8">
			<Spinner size="8" />
			<span class="ml-3 text-gray-600 dark:text-gray-300">Loading pool details...</span>
		</div>
	</div>
{:else if error}
	<div class="bg-white dark:bg-gray-800 shadow-md rounded-xl p-6 mb-6">
		<div
			class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
		>
			<p class="text-red-800 dark:text-red-200">{error}</p>
		</div>
	</div>
{/if}
