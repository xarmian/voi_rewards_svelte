<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { Modal, Button, Badge } from 'flowbite-svelte';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		tokenSelect: UniqueToken;
		compare: UniqueToken[];
		watchlist: UniqueToken;
		action: { type: string; data: any };
		close: void;
	}>();

	export let open = false;
	export let selectedTokens: UniqueToken[] = [];

	interface Command {
		id: string;
		title: string;
		description: string;
		icon: string;
		action: () => void;
		category: 'token' | 'action' | 'filter' | 'navigation';
		shortcut?: string;
		data?: any;
	}

	let searchQuery = '';
	let searchInput: HTMLInputElement;
	let commands: Command[] = [];
	let filteredCommands: Command[] = [];
	let selectedIndex = 0;
	let isLoading = false;
	let recentSearches: string[] = [];
	let trendingTokens: UniqueToken[] = [];
	let naturalLanguageResults: any = null;

	// Categories with icons and colors
	const categories = {
		token: { icon: 'fas fa-coins', color: 'text-blue-600', label: 'Tokens' },
		action: { icon: 'fas fa-bolt', color: 'text-purple-600', label: 'Actions' },
		filter: { icon: 'fas fa-filter', color: 'text-green-600', label: 'Filters' },
		navigation: { icon: 'fas fa-compass', color: 'text-orange-600', label: 'Navigate' }
	};

	// Natural language patterns
	const nlPatterns = [
		{ pattern: /high volume tokens?/i, type: 'filter', filter: { volume: { min: 100000 } } },
		{ pattern: /tokens? with tvl.*?(\d+)/i, type: 'filter', filter: { tvl: { min: '$1' } } },
		{ pattern: /top movers?/i, type: 'filter', filter: { priceChange24h: { order: 'desc' } } },
		{ pattern: /new tokens?/i, type: 'filter', filter: { createdAt: { days: 7 } } },
		{ pattern: /compare (.+?) (?:and|with) (.+)/i, type: 'compare', tokens: ['$1', '$2'] },
		{ pattern: /show me (.+?) pools?/i, type: 'tokenPools', token: '$1' }
	];

	onMount(() => {
		loadRecentSearches();
		loadTrendingTokens();
		document.addEventListener('keydown', handleGlobalKeydown);
		return () => {
			document.removeEventListener('keydown', handleGlobalKeydown);
		};
	});

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.removeEventListener('keydown', handleGlobalKeydown);
		}
	});

	// Auto-focus search when opened
	$: if (open && searchInput) {
		setTimeout(() => searchInput?.focus(), 100);
		searchQuery = '';
		selectedIndex = 0;
		updateCommands();
	}

	// Update commands when search query changes
	$: if (searchQuery !== undefined) {
		updateCommands();
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		// Open command palette with Cmd/Ctrl + K
		if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
			event.preventDefault();
			open = true;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Escape':
				close();
				break;
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (filteredCommands[selectedIndex]) {
					executeCommand(filteredCommands[selectedIndex]);
				}
				break;
		}
	}

	async function updateCommands() {
		commands = [];
		
		// If empty query, show recent searches and trending
		if (!searchQuery.trim()) {
			commands = [
				...getRecentCommands(),
				...getTrendingCommands(),
				...getQuickActions()
			];
		} else {
			isLoading = true;
			
			// Check for natural language patterns
			const nlResult = processNaturalLanguage(searchQuery);
			if (nlResult) {
				naturalLanguageResults = nlResult;
				commands.push(createNaturalLanguageCommand(nlResult));
			}

			// Search for tokens
			const tokenResults = await searchTokens(searchQuery);
			commands = [...commands, ...tokenResults];

			// Add action commands based on query
			commands = [...commands, ...getActionCommands(searchQuery)];
			
			isLoading = false;
		}

		filteredCommands = commands;
		selectedIndex = 0;
	}

	function processNaturalLanguage(query: string) {
		for (const pattern of nlPatterns) {
			const match = query.match(pattern.pattern);
			if (match) {
				return {
					type: pattern.type,
					query,
					match,
					data: pattern
				};
			}
		}
		return null;
	}

	function createNaturalLanguageCommand(nlResult: any): Command {
		return {
			id: 'nl-' + Date.now(),
			title: `Apply filter: ${nlResult.query}`,
			description: 'Natural language query detected',
			icon: 'fas fa-magic',
			category: 'filter',
			action: () => {
				dispatch('action', { type: 'naturalLanguage', data: nlResult });
				close();
			}
		};
	}

	async function searchTokens(query: string): Promise<Command[]> {
		try {
			const response = await fetch(`/api/tokens?q=${encodeURIComponent(query)}&limit=10`);
			const data = await response.json();
			
			if (data.tokens) {
				return data.tokens.map((token: UniqueToken, index: number) => ({
					id: `token-${token.id}-${Date.now()}-${index}`,
					title: token.symbol,
					description: `${token.type} • ${token.poolCount} pools • ID: ${token.id}`,
					icon: getTokenIcon(token.type),
					category: 'token' as const,
					data: token,
					action: () => {
						addToRecentSearches(token.symbol);
						dispatch('tokenSelect', token);
						close();
					}
				}));
			}
		} catch (error) {
			console.error('Token search error:', error);
		}
		return [];
	}

	function getTokenIcon(type: string): string {
		switch (type?.toUpperCase()) {
			case 'ARC200': return 'fas fa-layer-group';
			case 'ASA': return 'fas fa-cube';
			case 'VOI': return 'fas fa-star';
			default: return 'fas fa-coins';
		}
	}

	function getRecentCommands(): Command[] {
		return recentSearches.slice(0, 5).map((search, index) => ({
			id: `recent-${index}`,
			title: search,
			description: 'Recent search',
			icon: 'fas fa-history',
			category: 'token',
			action: () => {
				searchQuery = search;
				updateCommands();
			}
		}));
	}

	function getTrendingCommands(): Command[] {
		return trendingTokens.slice(0, 3).map((token, index) => ({
			id: `trending-${token.id}-${Date.now()}-${index}`,
			title: `${token.symbol} 🔥`,
			description: 'Trending token',
			icon: 'fas fa-fire',
			category: 'token',
			data: token,
			action: () => {
				dispatch('tokenSelect', token);
				close();
			}
		}));
	}

	function getQuickActions(): Command[] {
		const baseActions = [
			{
				id: 'compare-tokens',
				title: 'Compare Tokens',
				description: 'Side-by-side token comparison',
				icon: 'fas fa-balance-scale',
				category: 'action' as const,
				shortcut: 'C',
				action: () => {
					dispatch('action', { type: 'compare', data: null });
					close();
				}
			},
			{
				id: 'view-heatmap',
				title: 'Token Heatmap',
				description: 'Visual performance overview',
				icon: 'fas fa-th',
				category: 'navigation' as const,
				shortcut: 'H',
				action: () => {
					dispatch('action', { type: 'heatmap', data: null });
					close();
				}
			},
			{
				id: 'filter-high-volume',
				title: 'High Volume Tokens',
				description: 'Show tokens with volume > $100K',
				icon: 'fas fa-arrow-up',
				category: 'filter' as const,
				action: () => {
					dispatch('action', { type: 'filter', data: { volume: { min: 100000 } } });
					close();
				}
			}
		];

		// Add context-aware actions based on selected tokens
		if (selectedTokens.length > 0) {
			baseActions.unshift({
				id: 'add-to-watchlist',
				title: 'Add to Watchlist',
				description: `Add ${selectedTokens[0]?.symbol} to watchlist`,
				icon: 'fas fa-star',
				category: 'action',
				action: () => {
					if (selectedTokens[0]) {
						dispatch('watchlist', selectedTokens[0]);
					}
					close();
				}
			});
		}

		return baseActions;
	}

	function getActionCommands(query: string): Command[] {
		const actions: Command[] = [];
		const lowerQuery = query.toLowerCase();

		if (lowerQuery.includes('compare')) {
			actions.push({
				id: 'start-comparison',
				title: 'Start Token Comparison',
				description: 'Compare multiple tokens side by side',
				icon: 'fas fa-balance-scale',
				category: 'action',
				action: () => {
					dispatch('action', { type: 'compare', data: query });
					close();
				}
			});
		}

		if (lowerQuery.includes('watchlist') || lowerQuery.includes('favorite')) {
			actions.push({
				id: 'manage-watchlist',
				title: 'Manage Watchlist',
				description: 'View and edit your token watchlist',
				icon: 'fas fa-list-ul',
				category: 'navigation',
				action: () => {
					dispatch('action', { type: 'watchlist', data: null });
					close();
				}
			});
		}

		return actions;
	}

	function executeCommand(command: Command) {
		command.action();
		if (command.category === 'token' && command.data) {
			addToRecentSearches(command.data.symbol);
		}
	}

	function addToRecentSearches(search: string) {
		recentSearches = [search, ...recentSearches.filter(s => s !== search)].slice(0, 10);
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('commandPaletteRecents', JSON.stringify(recentSearches));
		}
	}

	function loadRecentSearches() {
		try {
			const stored = localStorage.getItem('commandPaletteRecents');
			if (stored) {
				recentSearches = JSON.parse(stored);
			}
		} catch (error) {
			recentSearches = [];
		}
	}

	async function loadTrendingTokens() {
		try {
			const response = await fetch('/api/tokens?trending=true&limit=5');
			const data = await response.json();
			if (data.tokens) {
				trendingTokens = data.tokens;
			}
		} catch (error) {
			console.error('Failed to load trending tokens:', error);
		}
	}

	function close() {
		open = false;
		dispatch('close');
	}

	function getCategoryInfo(category: string) {
		return categories[category as keyof typeof categories] || categories.token;
	}
</script>

<Modal bind:open size="lg" outsideclose class="command-palette">
	<div class="command-palette-container" on:keydown={handleKeydown} tabindex="-1">
		<!-- Header with search -->
		<div class="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-600">
			<div class="relative flex-1">
				<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
					<i class="fas fa-search text-gray-400"></i>
				</div>
				<input
					bind:this={searchInput}
					bind:value={searchQuery}
					on:input={updateCommands}
					placeholder="Search tokens, or try 'high volume tokens', 'compare VOI and USDC'..."
					class="w-full pl-10 pr-4 py-3 text-lg bg-transparent border-none focus:ring-0 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
					autocomplete="off"
				/>
			</div>
			{#if isLoading}
				<div class="flex-shrink-0">
					<i class="fas fa-spinner fa-spin text-gray-400"></i>
				</div>
			{/if}
		</div>

		<!-- Commands list -->
		<div class="max-h-96 overflow-y-auto">
			{#if filteredCommands.length === 0 && !isLoading}
				<div class="p-8 text-center text-gray-500 dark:text-gray-400" transition:fade>
					<i class="fas fa-search text-3xl mb-3"></i>
					<p class="text-lg font-medium mb-1">
						{searchQuery ? 'No results found' : 'Start typing to search'}
					</p>
					<p class="text-sm">
						{searchQuery 
							? 'Try different keywords or check spelling' 
							: 'Try "high volume tokens" or "compare VOI and USDC"'
						}
					</p>
				</div>
			{:else}
				{#each filteredCommands as command, index (command.id)}
					<button
						type="button"
						class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none transition-colors duration-150 {
							selectedIndex === index ? 'bg-purple-50 dark:bg-purple-900/30 border-r-2 border-purple-500' : ''
						}"
						on:click={() => executeCommand(command)}
						transition:fade={{ duration: 150 }}
					>
						<div class="flex items-center gap-3">
							<div class="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
								<i class="{command.icon} {getCategoryInfo(command.category).color}"></i>
							</div>
							
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<p class="font-medium text-gray-900 dark:text-white truncate">
										{command.title}
									</p>
									{#if command.shortcut}
										<Badge class="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400">
											{command.shortcut}
										</Badge>
									{/if}
								</div>
								<p class="text-sm text-gray-500 dark:text-gray-400 truncate">
									{command.description}
								</p>
							</div>

							<div class="flex-shrink-0">
								<Badge class="text-xs px-2 py-1 {
									command.category === 'token' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
									command.category === 'action' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
									command.category === 'filter' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
									'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
								}">
									{getCategoryInfo(command.category).label}
								</Badge>
							</div>
						</div>
					</button>
				{/each}
			{/if}
		</div>

		<!-- Footer with shortcuts -->
		<div class="px-4 py-3 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
			<div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
				<div class="flex items-center gap-4">
					<div class="flex items-center gap-1">
						<kbd class="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">↵</kbd>
						<span>Select</span>
					</div>
					<div class="flex items-center gap-1">
						<kbd class="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">↑↓</kbd>
						<span>Navigate</span>
					</div>
					<div class="flex items-center gap-1">
						<kbd class="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">Esc</kbd>
						<span>Close</span>
					</div>
				</div>
				<div class="text-right">
					<span>⌘K to open anywhere</span>
				</div>
			</div>
		</div>
	</div>
</Modal>

<style>
	.command-palette-container {
		outline: none;
	}

	:global(.command-palette .modal-content) {
		padding: 0 !important;
		max-width: 640px !important;
		border-radius: 12px !important;
	}

	:global(.command-palette .modal-backdrop) {
		backdrop-filter: blur(4px);
		background-color: rgba(0, 0, 0, 0.5);
	}

	kbd {
		font-family: ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
		font-size: 0.75rem;
		font-weight: 500;
	}
</style>