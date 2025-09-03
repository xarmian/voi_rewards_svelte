<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Card, Badge, Button, Spinner } from 'flowbite-svelte';
	import type { TokenPair } from '$lib/types/ohlcv.types';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		selectPool: TokenPair;
	}>();

	export let selectedToken: UniqueToken | null = null;
	export let selectedPool: TokenPair | null = null;
	export let loading = false;

	let pools: TokenPair[] = [];
	let error = '';

	// Reactive statement to fetch pools when token changes
	$: if (selectedToken) {
		fetchPoolsForToken(selectedToken);
	} else {
		pools = [];
	}

	async function fetchPoolsForToken(token: UniqueToken) {
		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/token-pairs?tokenId=${token.id}&limit=100`);
			const data = await response.json();

			if (data.error) throw new Error(data.error);

			pools = data.pairs || [];

			// Auto-select the TOKEN/VOI pool if it exists and no pool is selected
			if (!selectedPool && pools.length > 0) {
				const voiPool = pools.find((pool) => {
					const normalizedQuote =
						pool.quoteSymbol.toUpperCase() === 'WVOI' ? 'VOI' : pool.quoteSymbol.toUpperCase();
					return normalizedQuote === 'VOI';
				});
				if (voiPool) {
					selectPool(voiPool);
				} else {
					// Select the first pool if no VOI pool exists
					selectPool(pools[0]);
				}
			}
		} catch (err) {
			console.error('Error fetching pools for token:', err);
			error = err instanceof Error ? err.message : 'Failed to load pools';
			pools = [];
		} finally {
			loading = false;
		}
	}

	function selectPool(pool: TokenPair) {
		selectedPool = pool;
		dispatch('selectPool', pool);
	}

	function formatPairDisplay(pair: TokenPair): string {
		const normalizeSymbol = (symbol: string) => (symbol.toUpperCase() === 'WVOI' ? 'VOI' : symbol);
		return `${normalizeSymbol(pair.baseSymbol)}/${normalizeSymbol(pair.quoteSymbol)}`;
	}

	function getTokenTypeColor(symbol: string): string {
		const sym = symbol.toUpperCase();
		if (sym === 'VOI' || sym === 'WVOI') {
			return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
		} else if (sym.includes('USD') || sym === 'USDC' || sym === 'USDT') {
			return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
		} else if (sym === 'ALGO') {
			return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
		} else {
			return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
		}
	}
</script>

{#if selectedToken}
	<Card class="bg-white dark:bg-gray-800">
		<div class="flex items-center justify-between mb-4">
			<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
				Available {selectedToken.symbol} Pools
			</h3>
			<Badge class="text-sm px-3 py-1">
				{pools.length} pools
			</Badge>
		</div>

		{#if loading}
			<div class="flex items-center justify-center py-8">
				<Spinner size="8" class="mr-3" />
				<span class="text-gray-600 dark:text-gray-400">Loading pools...</span>
			</div>
		{:else if error}
			<div class="text-center py-8 text-red-600 dark:text-red-400">
				<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
				<p class="font-medium">Failed to load pools</p>
				<p class="text-sm mt-1">{error}</p>
			</div>
		{:else if pools.length === 0}
			<div class="text-center py-8 text-gray-500 dark:text-gray-400">
				<i class="fas fa-search text-2xl mb-2"></i>
				<p>No pools found for {selectedToken.symbol}</p>
				<p class="text-sm mt-1">This token may not be available for trading</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each pools as pool}
					<button
						type="button"
						class="w-full p-3 text-left rounded-lg border transition-all duration-200 {selectedPool?.poolId ===
						pool.poolId
							? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-400'
							: 'border-gray-200 dark:border-gray-600 hover:border-purple-300 hover:bg-gray-50 dark:hover:bg-gray-700 dark:hover:border-purple-500'}"
						on:click={() => selectPool(pool)}
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<span class="font-medium text-gray-900 dark:text-white text-lg">
									{formatPairDisplay(pool)}
								</span>
								{#if pool.quoteSymbol.toUpperCase() === 'VOI' || pool.quoteSymbol.toUpperCase() === 'WVOI'}
									<Badge
										class="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
									>
										Primary
									</Badge>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<Badge class="text-xs px-2 py-0.5 {getTokenTypeColor(pool.quoteSymbol)}">
									{pool.quoteSymbol.toUpperCase() === 'WVOI' ? 'VOI' : pool.quoteSymbol}
								</Badge>
								{#if selectedPool?.poolId === pool.poolId}
									<i class="fas fa-check-circle text-purple-600 dark:text-purple-400"></i>
								{/if}
							</div>
						</div>
						<div class="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
							<span>Pool ID: {pool.poolId}</span>
							<span>Base: {pool.baseDecimals} decimals</span>
							<span>Quote: {pool.quoteDecimals} decimals</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</Card>
{:else}
	<Card class="bg-gray-50 dark:bg-gray-700">
		<div class="text-center py-12 text-gray-500 dark:text-gray-400">
			<i class="fas fa-coins text-4xl mb-4"></i>
			<h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Select a Token</h4>
			<p>Choose a token above to view its available trading pools</p>
		</div>
	</Card>
{/if}
