<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { Input, Badge } from 'flowbite-svelte';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		select: UniqueToken;
	}>();

	export let selectedToken: UniqueToken | null = null;
	export let disabled = false;

	let loading = false;
	let error = '';
	let searchQuery = '';
	let searchResults: UniqueToken[] = [];
	let popularTokens: UniqueToken[] = [];
	let dropdownOpen = false;
	let searchTimeout: NodeJS.Timeout;
	let lastToken: UniqueToken | null = null;

	// When parent clears selection, also clear input value
	$: if (lastToken !== selectedToken) {
		lastToken = selectedToken;
		if (!selectedToken) {
			searchQuery = '';
		} else {
			searchQuery = selectedToken.symbol;
		}
	}

	// Fetch popular tokens on mount
	onMount(async () => {
		await fetchPopularTokens();
	});

	async function fetchPopularTokens() {
		try {
			const response = await fetch('/api/tokens?limit=10');
			const data = await response.json();

			if (data.error) throw new Error(data.error);

			popularTokens = data.tokens;
		} catch (err) {
			console.error('Error fetching popular tokens:', err);
			error = err instanceof Error ? err.message : 'Failed to load popular tokens';
		}
	}

	async function searchTokens(query: string) {
		if (!query.trim()) {
			searchResults = [];
			return;
		}

		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/tokens?q=${encodeURIComponent(query)}&limit=20`);
			const data = await response.json();

			if (data.error) throw new Error(data.error);

			searchResults = data.tokens;
		} catch (err) {
			console.error('Error searching tokens:', err);
			error = err instanceof Error ? err.message : 'Search failed';
			searchResults = [];
		} finally {
			loading = false;
		}
	}

	function handleSearchInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			searchTokens(searchQuery);
		}, 300); // Debounce search
	}

	function selectToken(token: UniqueToken) {
		selectedToken = token;
		searchQuery = token.symbol;
		dropdownOpen = false;
		// blur input to clearly end selection
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		dispatch('select', token);
	}

	function handleInputFocus() {
		dropdownOpen = true;
		if (!searchQuery && popularTokens.length > 0) {
			searchResults = popularTokens;
		}
	}

	function handleInputBlur() {
		// Delay closing to allow clicks on dropdown items
		setTimeout(() => {
			dropdownOpen = false;
		}, 200);
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
	<!-- Token Input -->
	<div class="relative">
		<Input
			bind:value={searchQuery}
			on:input={handleSearchInput}
			on:focus={handleInputFocus}
			on:blur={handleInputBlur}
			placeholder="Search for a token (e.g. USDC, ALGO)"
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
				<!-- Popular Tokens Section -->
				{#if !searchQuery && popularTokens.length > 0}
					<div class="px-4 py-2 border-b border-gray-200 dark:border-gray-600">
						<div
							class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Popular Tokens
						</div>
					</div>
					{#each popularTokens as token}
						<button
							type="button"
							class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none transition-colors"
							on:click={() => selectToken(token)}
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span class="font-medium text-gray-900 dark:text-white">
										{token.symbol}
									</span>
								</div>
								<div class="flex gap-2 items-center">
									<Badge class="text-xs px-2 py-0.5 {getTokenTypeColor(token.type)}"
										>{token.type}</Badge
									>
									<span class="text-xs text-gray-500 dark:text-gray-400">
										{token.poolCount} pools
									</span>
								</div>
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
								Token ID: {token.id} | Decimals: {token.decimals}
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
					{#each searchResults as token}
						<button
							type="button"
							class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none transition-colors"
							on:click={() => selectToken(token)}
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span class="font-medium text-gray-900 dark:text-white">
										{token.symbol}
									</span>
								</div>
								<div class="flex gap-2 items-center">
									<Badge class="text-xs px-2 py-0.5 {getTokenTypeColor(token.type)}"
										>{token.type}</Badge
									>
									<span class="text-xs text-gray-500 dark:text-gray-400">
										{token.poolCount} pools
									</span>
								</div>
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
								Token ID: {token.id} | Decimals: {token.decimals}
							</div>
						</button>
					{/each}
				{/if}

				<!-- No Results -->
				{#if searchQuery && searchResults.length === 0 && !loading}
					<div class="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
						<i class="fas fa-search text-2xl mb-2"></i>
						<p>No tokens found for "{searchQuery}"</p>
						<p class="text-sm mt-1">Try searching with a different token symbol</p>
					</div>
				{/if}

				<!-- Loading State -->
				{#if loading}
					<div class="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
						<i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
						<p>Searching tokens...</p>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>