<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { Input, Badge } from 'flowbite-svelte';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		tokenSelect: UniqueToken;
	}>();

	export let selectedToken: UniqueToken | null = null;
	export let allTokens: UniqueToken[] = [];
	export let disabled = false;

	let searchQuery = '';
	let dropdownOpen = false;
	let searchInput: any;

	// Filter tokens based on search query
	$: filteredTokens = searchQuery.trim() 
		? allTokens.filter(token => 
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.id.toString().includes(searchQuery)
		).slice(0, 20)
		: allTokens.slice(0, 10); // Show first 10 tokens when no search

	// Handle token selection
	function selectToken(token: UniqueToken) {
		dispatch('tokenSelect', token);
		searchQuery = '';
		dropdownOpen = false;
		if (searchInput) searchInput.blur();
	}

	// Reset to VOI
	function resetToVOI() {
		const voiToken = {
			id: 0,
			symbol: 'VOI',
			decimals: 6,
			type: 'VOI' as const,
			poolCount: 0
		};
		dispatch('tokenSelect', voiToken);
		searchQuery = '';
		dropdownOpen = false;
		if (searchInput) searchInput.blur();
	}

	// Handle input focus/blur
	function handleFocus() {
		dropdownOpen = true;
	}

	function handleBlur() {
		// Small delay to allow clicking on dropdown items
		setTimeout(() => {
			dropdownOpen = false;
		}, 150);
	}

	// Clear search and reset to VOI
	function clearSearch() {
		searchQuery = '';
		resetToVOI();
	}

	// Get token type styling
	function getTokenTypeColor(type: string): string {
		switch (type?.toUpperCase()) {
			case 'ARC200':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
			case 'ASA':
				return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
			case 'VOI':
				return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300';
		}
	}

	// Update search query when selected token changes (but don't interfere with user typing)
	$: if (selectedToken && !dropdownOpen) {
		searchQuery = selectedToken.symbol === 'VOI' ? '' : selectedToken.symbol;
	}
</script>

<div class="relative w-full">
	<!-- Search Input -->
	<div class="relative">
		<Input
			bind:this={searchInput}
			bind:value={searchQuery}
			on:focus={handleFocus}
			on:blur={handleBlur}
			placeholder="Search tokens (e.g., USDC, ALGO, 12345)"
			{disabled}
			class="pr-20"
		/>
		
		<!-- Right side icons -->
		<div class="absolute inset-y-0 right-0 flex items-center pr-3 gap-2">
			{#if searchQuery}
				<button
					type="button"
					on:click={clearSearch}
					class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
					title="Clear search"
				>
					<i class="fas fa-times text-sm"></i>
				</button>
			{/if}
			
			{#if selectedToken && selectedToken.symbol !== 'VOI'}
				<button
					type="button"
					on:click={resetToVOI}
					class="text-gray-400 hover:text-red-500 transition-colors"
					title="Reset to VOI"
				>
					<i class="fas fa-undo text-sm"></i>
				</button>
			{/if}
			
			<i class="fas fa-search text-gray-400"></i>
		</div>
	</div>

	<!-- Dropdown -->
	{#if dropdownOpen && !disabled}
		<div class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-96 overflow-y-auto">
			{#if filteredTokens.length > 0}
				<!-- Header -->
				<div class="px-4 py-2 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
					<div class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
						{searchQuery ? `Search Results (${filteredTokens.length})` : 'Popular Tokens'}
					</div>
				</div>

				<!-- Token List -->
				{#each filteredTokens as token}
					<button
						type="button"
						class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0"
						on:click={() => selectToken(token)}
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<!-- Token Icon -->
								<div class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold">
									{token.symbol.slice(0, 2)}
								</div>
								
								<!-- Token Info -->
								<div class="text-left">
									<div class="font-medium text-gray-900 dark:text-white">
										{token.symbol}
									</div>
									<div class="text-xs text-gray-500 dark:text-gray-400">
										ID: {token.id} • {token.decimals} decimals
									</div>
								</div>
							</div>
							
							<!-- Right side info -->
							<div class="flex flex-col items-end gap-1">
								<Badge class="text-xs px-2 py-0.5 {getTokenTypeColor(token.type)}">
									{token.type}
								</Badge>
								<span class="text-xs text-gray-500 dark:text-gray-400">
									{token.poolCount} pools
								</span>
							</div>
						</div>
					</button>
				{/each}
			{:else if searchQuery}
				<!-- No Results -->
				<div class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
					<i class="fas fa-search text-3xl mb-3 text-gray-300 dark:text-gray-600"></i>
					<p class="font-medium">No tokens found</p>
					<p class="text-sm mt-1">Try searching with a different symbol or token ID</p>
				</div>
			{:else}
				<!-- Loading or Empty State -->
				<div class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
					<i class="fas fa-coins text-3xl mb-3 text-gray-300 dark:text-gray-600"></i>
					<p class="font-medium">No tokens available</p>
					<p class="text-sm mt-1">Try refreshing the page</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
