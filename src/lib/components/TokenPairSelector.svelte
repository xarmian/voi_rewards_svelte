<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { Button, Input, Dropdown, DropdownItem, Badge } from 'flowbite-svelte';
	import type { TokenPair } from '$lib/types/ohlcv.types';

	const dispatch = createEventDispatcher<{
		select: TokenPair;
	}>();

	export let selectedPair: TokenPair | null = null;
	export let disabled = false;

	let loading = false;
	let error = '';
	let searchQuery = '';
	let searchResults: TokenPair[] = [];
	let popularPairs: TokenPair[] = [];
	let dropdownOpen = false;
	let searchTimeout: NodeJS.Timeout;
	let lastPair: TokenPair | null = null;

	// When parent clears selection, also clear input value
	$: if (lastPair !== selectedPair) {
		lastPair = selectedPair;
		if (!selectedPair) {
			searchQuery = '';
		}
	}

	// Fetch popular pairs on mount
	onMount(async () => {
		await fetchPopularPairs();
	});

	async function fetchPopularPairs() {
		try {
			const response = await fetch('/api/token-pairs?popular=true&limit=10');
			const data = await response.json();

			if (data.error) throw new Error(data.error);

			popularPairs = data.pairs;
		} catch (err) {
			console.error('Error fetching popular pairs:', err);
			error = err instanceof Error ? err.message : 'Failed to load popular pairs';
		}
	}

	async function searchTokenPairs(query: string) {
		if (!query.trim()) {
			searchResults = [];
			return;
		}

		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/token-pairs?q=${encodeURIComponent(query)}&limit=20`);
			const data = await response.json();

			if (data.error) throw new Error(data.error);

			searchResults = data.pairs;
		} catch (err) {
			console.error('Error searching token pairs:', err);
			error = err instanceof Error ? err.message : 'Search failed';
			searchResults = [];
		} finally {
			loading = false;
		}
	}

	function handleSearchInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			searchTokenPairs(searchQuery);
		}, 300); // Debounce search
	}

	function selectTokenPair(pair: TokenPair) {
		selectedPair = pair;
		searchQuery = formatPairDisplay(pair);
		dropdownOpen = false;
		// blur input to clearly end selection
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		dispatch('select', pair);
	}

	function handleInputFocus() {
		dropdownOpen = true;
		if (!searchQuery && popularPairs.length > 0) {
			searchResults = popularPairs;
		}
	}

	function handleInputBlur() {
		// Delay closing to allow clicks on dropdown items
		setTimeout(() => {
			dropdownOpen = false;
		}, 200);
	}

	function normalizeSymbol(sym: string): string {
		if (!sym) return sym;
		return sym.toUpperCase() === 'WVOI' || sym.toUpperCase() === 'W-VOI' ? 'VOI' : sym;
	}

	function formatPairDisplay(pair: TokenPair): string {
		return `${normalizeSymbol(pair.baseSymbol)}/${normalizeSymbol(pair.quoteSymbol)}`;
	}

	function getTokenTypeColor(type: string): string {
		switch (type?.toUpperCase()) {
			case 'ARC200':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
			case 'ASA':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
			case 'VOI':
				return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
		}
	}
</script>

<div class="relative w-full">
	<!-- Token Pair Input -->
	<div class="relative">
		<Input
			bind:value={searchQuery}
			on:input={handleSearchInput}
			on:focus={handleInputFocus}
			on:blur={handleInputBlur}
			placeholder="Search tokens or pools (e.g. VOI/USDT)"
			{disabled}
			class="pr-10"
		/>
		<div class="absolute inset-y-0 right-0 flex items-center pr-3">
			{#if loading}
				<i class="fas fa-spinner fa-spin text-gray-400"></i>
			{:else}
				<i class="fas fa-search text-gray-400"></i>
			{/if}
		</div>
	</div>

	<!-- Dropdown Results -->
	{#if dropdownOpen && !disabled}
		<div
			class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-96 overflow-y-auto"
		>
			{#if error}
				<div class="px-4 py-3 text-red-600 dark:text-red-400 text-sm">
					<i class="fas fa-exclamation-circle mr-2"></i>
					{error}
				</div>
			{:else}
				<!-- Popular Pairs Section -->
				{#if !searchQuery && popularPairs.length > 0}
					<div class="px-4 py-2 border-b border-gray-200 dark:border-gray-600">
						<div
							class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Popular Pairs
						</div>
					</div>
					{#each popularPairs as pair}
						<button
							type="button"
							class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none transition-colors"
							on:click={() => selectTokenPair(pair)}
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span class="font-medium text-gray-900 dark:text-white">
										{formatPairDisplay(pair)}
									</span>
								</div>
								<div class="flex gap-1">
									<Badge class="text-xs px-2 py-0.5 {getTokenTypeColor('')}"
										>{pair.baseSymbol}</Badge
									>
									<Badge class="text-xs px-2 py-0.5 {getTokenTypeColor('')}"
										>{pair.quoteSymbol}</Badge
									>
								</div>
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
								Pool ID: {pair.poolId || 'N/A'}
							</div>
						</button>
					{/each}
				{/if}

				<!-- Search Results Section -->
				{#if searchQuery && searchResults.length > 0}
					<div class="px-4 py-2 border-b border-gray-200 dark:border-gray-600">
						<div
							class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Search Results ({searchResults.length})
						</div>
					</div>
					{#each searchResults as pair}
						<button
							type="button"
							class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none transition-colors"
							on:click={() => selectTokenPair(pair)}
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span class="font-medium text-gray-900 dark:text-white">
										{formatPairDisplay(pair)}
									</span>
								</div>
								<div class="flex gap-1">
									<Badge class="text-xs px-2 py-0.5 {getTokenTypeColor('')}"
										>{pair.baseSymbol}</Badge
									>
									<Badge class="text-xs px-2 py-0.5 {getTokenTypeColor('')}"
										>{pair.quoteSymbol}</Badge
									>
								</div>
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
								Decimals: {pair.baseDecimals}/{pair.quoteDecimals} | Pool ID: {pair.poolId || 'N/A'}
							</div>
						</button>
					{/each}
				{/if}

				<!-- No Results -->
				{#if searchQuery && searchResults.length === 0 && !loading}
					<div class="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
						<i class="fas fa-search text-2xl mb-2"></i>
						<p>No token pairs found for "{searchQuery}"</p>
						<p class="text-sm mt-1">Try searching with different tokens</p>
					</div>
				{/if}

				<!-- Loading State -->
				{#if loading}
					<div class="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
						<i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
						<p>Searching token pairs...</p>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<!-- Intentionally no chip/tag UI to avoid multi-select impression -->
