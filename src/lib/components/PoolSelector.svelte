<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Input, Badge } from 'flowbite-svelte';
	import type { TokenPair } from '$lib/types/ohlcv.types';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		select: TokenPair | null;
	}>();

	export let selectedToken: UniqueToken | null = null;
	export let selectedPool: TokenPair | null = null;
	export let disabled = false;

	let loading = false;
	let error = '';
	let searchQuery = '';
	let searchResults: TokenPair[] = [];
	let dropdownOpen = false;
	let searchTimeout: NodeJS.Timeout;

	// Update search query when pool changes
	$: if (selectedPool) {
		searchQuery = formatPairDisplay(selectedPool);
	} else if (selectedToken && selectedToken.symbol.toUpperCase() === 'VOI') {
		searchQuery = ''; // Empty for VOI when no specific pool selected
	} else if (selectedToken) {
		searchQuery = `${selectedToken.symbol}/...`;
	} else {
		searchQuery = '';
	}

	// Auto-fetch pools when token changes
	$: if (selectedToken) {
		fetchPoolsForToken(selectedToken);
	}

	async function fetchPoolsForToken(token: UniqueToken) {
		loading = true;
		error = '';
		
		try {
			const response = await fetch(`/api/token-pairs?tokenSymbol=${token.symbol}&limit=20`);
			const data = await response.json();

			if (data.error) throw new Error(data.error);

			searchResults = data.pairs || [];
			
			// Auto-select TOKEN/VOI pool if no pool is selected, EXCEPT for VOI itself
			if (!selectedPool && searchResults.length > 0 && token.symbol.toUpperCase() !== 'VOI') {
				const voiPool = searchResults.find(pool => {
					const normalizedQuote = pool.quoteSymbol.toUpperCase() === 'WVOI' ? 'VOI' : pool.quoteSymbol.toUpperCase();
					return normalizedQuote === 'VOI';
				});
				if (voiPool) {
					selectPool(voiPool);
				}
			}
		} catch (err) {
			console.error('Error fetching pools for token:', err);
			error = err instanceof Error ? err.message : 'Failed to load pools';
			searchResults = [];
		} finally {
			loading = false;
		}
	}

	async function searchPools(query: string) {
		if (!selectedToken || !query.trim()) {
			return;
		}

		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/token-pairs?tokenSymbol=${selectedToken.symbol}&limit=20`);
			const data = await response.json();

			if (data.error) throw new Error(data.error);

			// Filter results based on query
			const filtered = (data.pairs || []).filter((pool: TokenPair) =>
				formatPairDisplay(pool).toLowerCase().includes(query.toLowerCase())
			);
			
			searchResults = filtered;
		} catch (err) {
			console.error('Error searching pools:', err);
			error = err instanceof Error ? err.message : 'Search failed';
			searchResults = [];
		} finally {
			loading = false;
		}
	}

	function handleSearchInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			searchPools(searchQuery);
		}, 300);
	}

	function selectPool(pool: TokenPair) {
		selectedPool = pool;
		searchQuery = formatPairDisplay(pool);
		dropdownOpen = false;
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		dispatch('select', pool);
	}

	function clearSelection() {
		selectedPool = null;
		searchQuery = selectedToken?.symbol.toUpperCase() === 'VOI' ? '' : `${selectedToken?.symbol}/...`;
		searchResults = [];
		dropdownOpen = false;
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		dispatch('select', null);
	}

	function handleInputFocus() {
		if (selectedToken) {
			dropdownOpen = true;
		}
	}

	function handleInputBlur() {
		setTimeout(() => {
			dropdownOpen = false;
		}, 200);
	}

	function formatPairDisplay(pair: TokenPair): string {
		const normalizeSymbol = (symbol: string) => symbol.toUpperCase() === 'WVOI' ? 'VOI' : symbol;
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

<div class="relative w-full">
	<!-- Pool Input -->
	<div class="relative">
		<Input
			bind:value={searchQuery}
			on:input={handleSearchInput}
			on:focus={handleInputFocus}
			on:blur={handleInputBlur}
			placeholder={selectedToken 
				? selectedToken.symbol.toUpperCase() === 'VOI' 
					? "Select VOI trading pair (optional)"
					: `Select ${selectedToken.symbol} pool`
				: "Select a token first"
			}
			{disabled}
			readonly={!selectedToken}
			class="{selectedPool ? 'pr-16' : 'pr-10'}"
		/>
		<div class="absolute inset-y-0 right-0 flex items-center pr-3">
			{#if selectedPool}
				<button
					type="button"
					class="flex items-center justify-center w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mr-2 cursor-pointer"
					on:click={clearSelection}
					title="Clear pool selection"
				>
					<i class="fas fa-times text-sm"></i>
				</button>
			{/if}
			{#if loading}
				<i class="fas fa-spinner fa-spin text-gray-400"></i>
			{:else}
				<i class="fas fa-exchange-alt text-gray-400"></i>
			{/if}
		</div>
	</div>

	<!-- Dropdown Results -->
	{#if dropdownOpen && selectedToken && !disabled}
		<div
			class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto"
		>
			{#if error}
				<div class="px-4 py-3 text-red-600 dark:text-red-400 text-sm">
					<i class="fas fa-exclamation-circle mr-2"></i>
					{error}
				</div>
			{:else if searchResults.length > 0}
				<!-- Clear selection option for VOI -->
				{#if selectedToken.symbol.toUpperCase() === 'VOI' && selectedPool}
					<button
						type="button"
						class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none transition-colors border-b border-gray-200 dark:border-gray-600"
						on:click={() => {
							selectedPool = null;
							searchQuery = '';
							dropdownOpen = false;
							dispatch('select', null);
						}}
					>
						<div class="flex items-center gap-2">
							<i class="fas fa-chart-line text-purple-600 dark:text-purple-400"></i>
							<span class="font-medium text-gray-900 dark:text-white">
								All VOI Markets (Default)
							</span>
						</div>
						<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
							Show aggregated VOI price and market data
						</div>
					</button>
				{/if}
				<div class="px-4 py-2 border-b border-gray-200 dark:border-gray-600">
					<div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
						{selectedToken.symbol} Trading Pools ({searchResults.length})
					</div>
				</div>
				{#each searchResults as pool}
					<button
						type="button"
						class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none transition-colors {
							selectedPool?.poolId === pool.poolId ? 'bg-purple-50 dark:bg-purple-900/20' : ''
						}"
						on:click={() => selectPool(pool)}
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="font-medium text-gray-900 dark:text-white">
									{formatPairDisplay(pool)}
								</span>
								{#if (pool.quoteSymbol.toUpperCase() === 'VOI' || pool.quoteSymbol.toUpperCase() === 'WVOI')}
									<Badge class="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
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
						<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
							Pool ID: {pool.poolId} | Decimals: {pool.baseDecimals}/{pool.quoteDecimals}
						</div>
					</button>
				{/each}
			{:else if !loading}
				<div class="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
					<i class="fas fa-search text-2xl mb-2"></i>
					<p>No pools found for {selectedToken.symbol}</p>
				</div>
			{/if}

			{#if loading}
				<div class="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
					<i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
					<p>Loading pools...</p>
				</div>
			{/if}
		</div>
	{/if}
</div>