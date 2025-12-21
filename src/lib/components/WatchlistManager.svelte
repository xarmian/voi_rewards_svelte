<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import {
		Card,
		Button,
		Badge,
		Input,
		Select,
		Toggle,
		Modal,
		Tabs,
		TabItem
	} from 'flowbite-svelte';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		tokenSelect: UniqueToken;
		compare: UniqueToken[];
		alert: { token: UniqueToken; condition: string; value: number };
	}>();

	export let open = false;

	interface WatchlistItem {
		id: string;
		token: UniqueToken;
		addedAt: Date;
		notes?: string;
		alerts: PriceAlert[];
		metrics: {
			volume24h: number;
			tvl: number;
			priceChange24h: number;
			priceChange7d: number;
			price: number;
		};
		tags: string[];
	}

	interface PriceAlert {
		id: string;
		condition: 'above' | 'below' | 'change_above' | 'change_below';
		value: number;
		active: boolean;
		triggered: boolean;
		createdAt: Date;
		triggeredAt?: Date;
	}

	interface Portfolio {
		totalValue: number;
		change24h: number;
		bestPerformer: WatchlistItem | null;
		worstPerformer: WatchlistItem | null;
	}

	let watchlist: WatchlistItem[] = [];
	let filteredWatchlist: WatchlistItem[] = [];
	let selectedItems: Set<string> = new Set();
	let searchQuery = '';
	let sortBy: 'name' | 'added' | 'performance' | 'volume' | 'tvl' = 'added';
	let sortDirection: 'asc' | 'desc' = 'desc';
	let filterTag = '';
	let showAlertDialog = false;
	let alertToken: UniqueToken | null = null;
	let newAlert: Partial<PriceAlert> = {};
	let showAddDialog = false;
	let activeTab: 'watchlist' | 'alerts' | 'insights' = 'watchlist';
	let portfolio: Portfolio = {
		totalValue: 0,
		change24h: 0,
		bestPerformer: null,
		worstPerformer: null
	};

	// Available tags for organization
	const availableTags = [
		'DeFi',
		'Gaming',
		'NFT',
		'Infrastructure',
		'Stablecoin',
		'High Risk',
		'Blue Chip',
		'New Listing',
		'Trending'
	];

	onMount(() => {
		loadWatchlist();
		loadPortfolioData();

		// Set up periodic price updates
		const interval = setInterval(updatePrices, 30000);
		return () => clearInterval(interval);
	});

	// Reactive filtering and sorting
	$: {
		filteredWatchlist = watchlist
			.filter((item) => {
				const matchesSearch =
					!searchQuery || item.token.symbol.toLowerCase().includes(searchQuery.toLowerCase());
				const matchesTag = !filterTag || item.tags.includes(filterTag);
				return matchesSearch && matchesTag;
			})
			.sort((a, b) => {
				let comparison = 0;

				switch (sortBy) {
					case 'name':
						comparison = a.token.symbol.localeCompare(b.token.symbol);
						break;
					case 'added':
						comparison = a.addedAt.getTime() - b.addedAt.getTime();
						break;
					case 'performance':
						comparison = a.metrics.priceChange24h - b.metrics.priceChange24h;
						break;
					case 'volume':
						comparison = a.metrics.volume24h - b.metrics.volume24h;
						break;
					case 'tvl':
						comparison = a.metrics.tvl - b.metrics.tvl;
						break;
				}

				return sortDirection === 'asc' ? comparison : -comparison;
			});
	}

	function loadWatchlist() {
		try {
			const saved = localStorage.getItem('tokenWatchlist');
			if (saved) {
				const parsedWatchlist = JSON.parse(saved);
				watchlist = parsedWatchlist.map((item: any) => ({
					...item,
					addedAt: new Date(item.addedAt),
					alerts: item.alerts.map((alert: any) => ({
						...alert,
						createdAt: new Date(alert.createdAt),
						triggeredAt: alert.triggeredAt ? new Date(alert.triggeredAt) : undefined
					}))
				}));
			}
		} catch (error) {
			console.error('Failed to load watchlist:', error);
			watchlist = [];
		}
	}

	function saveWatchlist() {
		try {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('tokenWatchlist', JSON.stringify(watchlist));
			}
		} catch (error) {
			console.error('Failed to save watchlist:', error);
		}
	}

	async function loadPortfolioData() {
		if (watchlist.length === 0) return;

		try {
			// Update metrics for all watchlist items
			const updatePromises = watchlist.map(async (item) => {
				const response = await fetch(`/api/token-analytics?tokenId=${item.token.id}`);
				const data = await response.json();

				if (data.success) {
					item.metrics = {
						volume24h: data.analytics.volume?.volume24h || 0,
						tvl: data.analytics.liquidity?.totalTvlUsd || 0,
						priceChange24h: Math.random() * 20 - 10, // Mock - replace with real data
						priceChange7d: Math.random() * 30 - 15, // Mock - replace with real data
						price: Math.random() * 100 // Mock - replace with real data
					};
				}
				return item;
			});

			watchlist = await Promise.all(updatePromises);

			// Calculate portfolio metrics
			const totalChange = watchlist.reduce((sum, item) => sum + item.metrics.priceChange24h, 0);
			portfolio = {
				totalValue: watchlist.reduce((sum, item) => sum + item.metrics.price * 100, 0), // Mock portfolio value
				change24h: totalChange / watchlist.length,
				bestPerformer: watchlist.reduce(
					(best, current) =>
						current.metrics.priceChange24h > (best?.metrics.priceChange24h || -Infinity)
							? current
							: best,
					null
				),
				worstPerformer: watchlist.reduce(
					(worst, current) =>
						current.metrics.priceChange24h < (worst?.metrics.priceChange24h || Infinity)
							? current
							: worst,
					null
				)
			};

			// Check alerts
			checkAlerts();
			saveWatchlist();
		} catch (error) {
			console.error('Failed to load portfolio data:', error);
		}
	}

	async function updatePrices() {
		await loadPortfolioData();
	}

	function addToWatchlist(token: UniqueToken) {
		const exists = watchlist.find((item) => item.token.id === token.id);
		if (exists) return;

		const newItem: WatchlistItem = {
			id: generateId(),
			token,
			addedAt: new Date(),
			alerts: [],
			metrics: {
				volume24h: 0,
				tvl: 0,
				priceChange24h: 0,
				priceChange7d: 0,
				price: 0
			},
			tags: []
		};

		watchlist = [...watchlist, newItem];
		saveWatchlist();
		loadPortfolioData();
	}

	function removeFromWatchlist(itemId: string) {
		watchlist = watchlist.filter((item) => item.id !== itemId);
		selectedItems.delete(itemId);
		selectedItems = selectedItems;
		saveWatchlist();
	}

	function toggleSelection(itemId: string) {
		if (selectedItems.has(itemId)) {
			selectedItems.delete(itemId);
		} else {
			selectedItems.add(itemId);
		}
		selectedItems = selectedItems;
	}

	function compareSelected() {
		const selectedTokens = watchlist
			.filter((item) => selectedItems.has(item.id))
			.map((item) => item.token);

		if (selectedTokens.length > 1) {
			dispatch('compare', selectedTokens);
		}
	}

	function addAlert(token: UniqueToken) {
		alertToken = token;
		newAlert = {
			condition: 'above',
			value: 0,
			active: true,
			triggered: false
		};
		showAlertDialog = true;
	}

	function saveAlert() {
		if (!alertToken || !newAlert.condition || !newAlert.value) return;

		const alert: PriceAlert = {
			id: generateId(),
			condition: newAlert.condition!,
			value: newAlert.value!,
			active: true,
			triggered: false,
			createdAt: new Date()
		};

		const item = watchlist.find((item) => item.token.id === alertToken!.id);
		if (item) {
			item.alerts = [...item.alerts, alert];
			saveWatchlist();
		}

		showAlertDialog = false;
		alertToken = null;
		newAlert = {};
	}

	function removeAlert(itemId: string, alertId: string) {
		const item = watchlist.find((item) => item.id === itemId);
		if (item) {
			item.alerts = item.alerts.filter((alert) => alert.id !== alertId);
			saveWatchlist();
		}
	}

	function toggleAlert(itemId: string, alertId: string) {
		const item = watchlist.find((item) => item.id === itemId);
		if (item) {
			const alert = item.alerts.find((alert) => alert.id === alertId);
			if (alert) {
				alert.active = !alert.active;
				saveWatchlist();
			}
		}
	}

	function checkAlerts() {
		watchlist.forEach((item) => {
			item.alerts.forEach((alert) => {
				if (!alert.active || alert.triggered) return;

				let shouldTrigger = false;
				const currentPrice = item.metrics.price;
				const priceChange = item.metrics.priceChange24h;

				switch (alert.condition) {
					case 'above':
						shouldTrigger = currentPrice > alert.value;
						break;
					case 'below':
						shouldTrigger = currentPrice < alert.value;
						break;
					case 'change_above':
						shouldTrigger = priceChange > alert.value;
						break;
					case 'change_below':
						shouldTrigger = priceChange < alert.value;
						break;
				}

				if (shouldTrigger) {
					alert.triggered = true;
					alert.triggeredAt = new Date();

					// Dispatch alert event
					dispatch('alert', {
						token: item.token,
						condition: alert.condition,
						value: alert.value
					});

					// Show browser notification if permitted
					showNotification(item.token, alert);
				}
			});
		});
	}

	function showNotification(token: UniqueToken, alert: PriceAlert) {
		if (Notification.permission === 'granted') {
			const title = `${token.symbol} Price Alert`;
			const body = `Price ${alert.condition} ${formatCurrency(alert.value)}`;

			new Notification(title, {
				body,
				icon: '/favicon.ico',
				tag: `alert-${alert.id}`
			});
		}
	}

	function addTagToItem(itemId: string, tag: string) {
		const item = watchlist.find((item) => item.id === itemId);
		if (item && !item.tags.includes(tag)) {
			item.tags = [...item.tags, tag];
			saveWatchlist();
		}
	}

	function removeTagFromItem(itemId: string, tag: string) {
		const item = watchlist.find((item) => item.id === itemId);
		if (item) {
			item.tags = item.tags.filter((t) => t !== tag);
			saveWatchlist();
		}
	}

	function exportWatchlist() {
		if (typeof document === 'undefined') return; // SSR check

		const dataStr = JSON.stringify(watchlist, null, 2);
		const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

		const exportFileDefaultName = `watchlist-${new Date().toISOString().split('T')[0]}.json`;

		const linkElement = document.createElement('a');
		linkElement.setAttribute('href', dataUri);
		linkElement.setAttribute('download', exportFileDefaultName);
		linkElement.click();
	}

	function generateId(): string {
		return Math.random().toString(36).substr(2, 9);
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(value);
	}

	function formatPercentage(value: number): string {
		return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
	}

	function formatNumber(value: number): string {
		if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
		if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
		if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
		return value.toFixed(2);
	}

	function getPerformanceColor(value: number): string {
		if (value > 5) return 'text-green-600 dark:text-green-400';
		if (value > 0) return 'text-green-500 dark:text-green-300';
		if (value > -5) return 'text-orange-500 dark:text-orange-300';
		return 'text-red-600 dark:text-red-400';
	}

	function getAllAlerts(): { item: WatchlistItem; alert: PriceAlert }[] {
		return watchlist.flatMap((item) => item.alerts.map((alert) => ({ item, alert })));
	}

	function getTriggeredAlerts(): { item: WatchlistItem; alert: PriceAlert }[] {
		return getAllAlerts().filter(({ alert }) => alert.triggered);
	}

	function getActiveAlerts(): { item: WatchlistItem; alert: PriceAlert }[] {
		return getAllAlerts().filter(({ alert }) => alert.active && !alert.triggered);
	}
</script>

<Modal bind:open size="full" class="watchlist-modal">
	<div class="p-6 h-full flex flex-col">
		<!-- Header -->
		<div
			class="flex items-center justify-between mb-6 border-b border-gray-200 dark:border-gray-600 pb-4"
		>
			<div>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white">Watchlist Manager</h2>
				<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
					Track {watchlist.length} tokens • {getActiveAlerts().length} active alerts
				</p>
			</div>

			<div class="flex items-center gap-2">
				<Button size="sm" color="alternative" on:click={() => (showAddDialog = true)}>
					<i class="fas fa-plus mr-2"></i>
					Add Token
				</Button>
				<Button size="sm" color="alternative" on:click={exportWatchlist}>
					<i class="fas fa-download mr-2"></i>
					Export
				</Button>
				<Button size="sm" color="light" on:click={() => (open = false)}>
					<i class="fas fa-times"></i>
				</Button>
			</div>
		</div>

		<!-- Tabs -->
		<div class="flex-1 min-h-0">
			<Tabs style="underline" bind:activeTabValue={activeTab}>
				<TabItem value="watchlist" title="Watchlist">
					<!-- Portfolio summary -->
					{#if watchlist.length > 0}
						<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
							<Card>
								<div class="text-center">
									<div class="text-2xl font-bold text-gray-900 dark:text-white">
										{formatCurrency(portfolio.totalValue)}
									</div>
									<div class="text-sm text-gray-500 dark:text-gray-400">Total Value</div>
								</div>
							</Card>

							<Card>
								<div class="text-center">
									<div class="text-2xl font-bold {getPerformanceColor(portfolio.change24h)}">
										{formatPercentage(portfolio.change24h)}
									</div>
									<div class="text-sm text-gray-500 dark:text-gray-400">24h Change</div>
								</div>
							</Card>

							<Card>
								<div class="text-center">
									<div class="text-lg font-bold text-green-600 dark:text-green-400">
										{portfolio.bestPerformer?.token.symbol || '-'}
									</div>
									<div class="text-sm text-gray-500 dark:text-gray-400">Best Performer</div>
								</div>
							</Card>

							<Card>
								<div class="text-center">
									<div class="text-lg font-bold text-red-600 dark:text-red-400">
										{portfolio.worstPerformer?.token.symbol || '-'}
									</div>
									<div class="text-sm text-gray-500 dark:text-gray-400">Worst Performer</div>
								</div>
							</Card>
						</div>
					{/if}

					<!-- Controls -->
					<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
						<div class="flex items-center gap-4">
							<!-- Search -->
							<div class="relative">
								<Input bind:value={searchQuery} placeholder="Search tokens..." class="w-64">
									<i slot="left" class="fas fa-search text-gray-400"></i>
								</Input>
							</div>

							<!-- Tag filter -->
							<Select bind:value={filterTag} class="w-40">
								<option value="">All Tags</option>
								{#each availableTags as tag}
									<option value={tag}>{tag}</option>
								{/each}
							</Select>
						</div>

						<div class="flex items-center gap-4">
							<!-- Sort controls -->
							<div class="flex items-center gap-2">
								<span class="text-sm text-gray-600 dark:text-gray-400">Sort:</span>
								<Select bind:value={sortBy} size="sm" class="w-32">
									<option value="added">Date Added</option>
									<option value="name">Name</option>
									<option value="performance">Performance</option>
									<option value="volume">Volume</option>
									<option value="tvl">TVL</option>
								</Select>
								<Button
									size="sm"
									color="alternative"
									on:click={() => (sortDirection = sortDirection === 'asc' ? 'desc' : 'asc')}
								>
									<i class="fas fa-sort-{sortDirection === 'asc' ? 'up' : 'down'}"></i>
								</Button>
							</div>

							<!-- Batch actions -->
							{#if selectedItems.size > 0}
								<div class="flex items-center gap-2">
									<Badge class="px-3 py-1">{selectedItems.size} selected</Badge>
									{#if selectedItems.size > 1}
										<Button size="sm" color="purple" on:click={compareSelected}>
											<i class="fas fa-balance-scale mr-1"></i>
											Compare
										</Button>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<!-- Watchlist table -->
					{#if filteredWatchlist.length > 0}
						<Card>
							<div class="overflow-x-auto">
								<table class="w-full text-left">
									<thead class="bg-gray-50 dark:bg-gray-700">
										<tr>
											<th class="px-4 py-3">
												<input
													type="checkbox"
													class="rounded border-gray-300 dark:border-gray-600"
													indeterminate={selectedItems.size > 0 &&
														selectedItems.size < watchlist.length}
													checked={selectedItems.size === watchlist.length}
													on:change={(e) => {
														if (e.currentTarget.checked) {
															selectedItems = new Set(watchlist.map((item) => item.id));
														} else {
															selectedItems = new Set();
														}
													}}
												/>
											</th>
											<th class="px-4 py-3 text-gray-900 dark:text-white">Token</th>
											<th class="px-4 py-3 text-gray-900 dark:text-white">Price</th>
											<th class="px-4 py-3 text-gray-900 dark:text-white">24h Change</th>
											<th class="px-4 py-3 text-gray-900 dark:text-white">7d Change</th>
											<th class="px-4 py-3 text-gray-900 dark:text-white">Volume</th>
											<th class="px-4 py-3 text-gray-900 dark:text-white">TVL</th>
											<th class="px-4 py-3 text-gray-900 dark:text-white">Alerts</th>
											<th class="px-4 py-3 text-gray-900 dark:text-white">Tags</th>
											<th class="px-4 py-3 text-gray-900 dark:text-white">Actions</th>
										</tr>
									</thead>
									<tbody>
										{#each filteredWatchlist as item (item.id)}
											<tr
												class="border-b dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 {selectedItems.has(
													item.id
												)
													? 'bg-purple-50 dark:bg-purple-900/20'
													: ''}"
												animate:flip={{ duration: 200 }}
											>
												<td class="px-4 py-3">
													<input
														type="checkbox"
														class="rounded border-gray-300 dark:border-gray-600"
														checked={selectedItems.has(item.id)}
														on:change={() => toggleSelection(item.id)}
													/>
												</td>

												<td class="px-4 py-3">
													<div class="flex items-center gap-3">
														<div
															class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm"
														>
															{item.token.symbol.slice(0, 2)}
														</div>
														<div>
															<div class="font-medium text-gray-900 dark:text-white">
																{item.token.symbol}
															</div>
															<div class="text-sm text-gray-500 dark:text-gray-400">
																{item.token.type}
															</div>
														</div>
													</div>
												</td>

												<td class="px-4 py-3 font-medium text-gray-900 dark:text-white">
													{formatCurrency(item.metrics.price)}
												</td>

												<td class="px-4 py-3">
													<span
														class="font-medium {getPerformanceColor(item.metrics.priceChange24h)}"
													>
														{formatPercentage(item.metrics.priceChange24h)}
													</span>
												</td>

												<td class="px-4 py-3">
													<span
														class="font-medium {getPerformanceColor(item.metrics.priceChange7d)}"
													>
														{formatPercentage(item.metrics.priceChange7d)}
													</span>
												</td>

												<td class="px-4 py-3 text-gray-700 dark:text-gray-300">
													${formatNumber(item.metrics.volume24h)}
												</td>

												<td class="px-4 py-3 text-gray-700 dark:text-gray-300">
													${formatNumber(item.metrics.tvl)}
												</td>

												<td class="px-4 py-3">
													<div class="flex items-center gap-2">
														<Badge
															class="text-xs {item.alerts.some((a) => a.active && !a.triggered)
																? 'bg-blue-100 text-blue-800'
																: item.alerts.some((a) => a.triggered)
																	? 'bg-red-100 text-red-800'
																	: 'bg-gray-100 text-gray-800'}"
														>
															{item.alerts.length}
														</Badge>
														<Button
															size="xs"
															color="alternative"
															on:click={() => addAlert(item.token)}
														>
															<i class="fas fa-bell text-xs"></i>
														</Button>
													</div>
												</td>

												<td class="px-4 py-3">
													<div class="flex flex-wrap gap-1">
														{#each item.tags as tag}
															<Badge
																class="text-xs cursor-pointer"
																on:click={() => removeTagFromItem(item.id, tag)}
															>
																{tag}
																<i class="fas fa-times ml-1"></i>
															</Badge>
														{/each}
													</div>
												</td>

												<td class="px-4 py-3">
													<div class="flex items-center gap-1">
														<Button
															size="xs"
															color="alternative"
															on:click={() => dispatch('tokenSelect', item.token)}
														>
															<i class="fas fa-external-link-alt"></i>
														</Button>
														<Button
															size="xs"
															color="red"
															outline
															on:click={() => removeFromWatchlist(item.id)}
														>
															<i class="fas fa-trash-alt"></i>
														</Button>
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</Card>
					{:else if watchlist.length === 0}
						<div class="text-center py-16">
							<i class="fas fa-star text-4xl text-gray-400 mb-4"></i>
							<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
								Your Watchlist is Empty
							</h3>
							<p class="text-gray-600 dark:text-gray-400 mb-4">
								Start tracking your favorite tokens by adding them to your watchlist
							</p>
							<Button color="purple" on:click={() => (showAddDialog = true)}>
								<i class="fas fa-plus mr-2"></i>
								Add Your First Token
							</Button>
						</div>
					{:else}
						<div class="text-center py-8">
							<i class="fas fa-search text-3xl text-gray-400 mb-3"></i>
							<p class="text-gray-600 dark:text-gray-400">No tokens match your filters</p>
						</div>
					{/if}
				</TabItem>

				<TabItem value="alerts" title="Alerts">
					<div class="space-y-6">
						<!-- Active alerts -->
						{#if getActiveAlerts().length > 0}
							<Card>
								<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
									Active Alerts ({getActiveAlerts().length})
								</h3>
								<div class="space-y-3">
									{#each getActiveAlerts() as { item, alert } (alert.id)}
										<div
											class="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
										>
											<div class="flex items-center gap-3">
												<div
													class="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold"
												>
													{item.token.symbol.slice(0, 2)}
												</div>
												<div>
													<span class="font-medium text-gray-900 dark:text-white">
														{item.token.symbol}
													</span>
													<span class="text-gray-600 dark:text-gray-400">
														{alert.condition}
														{formatCurrency(alert.value)}
													</span>
												</div>
											</div>
											<div class="flex items-center gap-2">
												<Toggle
													size="sm"
													checked={alert.active}
													on:change={() => toggleAlert(item.id, alert.id)}
												/>
												<Button
													size="xs"
													color="red"
													outline
													on:click={() => removeAlert(item.id, alert.id)}
												>
													<i class="fas fa-times"></i>
												</Button>
											</div>
										</div>
									{/each}
								</div>
							</Card>
						{/if}

						<!-- Triggered alerts -->
						{#if getTriggeredAlerts().length > 0}
							<Card>
								<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
									Recently Triggered ({getTriggeredAlerts().length})
								</h3>
								<div class="space-y-3">
									{#each getTriggeredAlerts() as { item, alert } (alert.id)}
										<div
											class="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
										>
											<div class="flex items-center gap-3">
												<i class="fas fa-bell text-red-600"></i>
												<div>
													<span class="font-medium text-gray-900 dark:text-white">
														{item.token.symbol}
													</span>
													<span class="text-gray-600 dark:text-gray-400">
														{alert.condition}
														{formatCurrency(alert.value)}
													</span>
													{#if alert.triggeredAt}
														<div class="text-xs text-gray-500 dark:text-gray-400">
															Triggered {alert.triggeredAt.toLocaleString()}
														</div>
													{/if}
												</div>
											</div>
											<Button
												size="xs"
												color="red"
												outline
												on:click={() => removeAlert(item.id, alert.id)}
											>
												<i class="fas fa-times"></i>
											</Button>
										</div>
									{/each}
								</div>
							</Card>
						{/if}

						{#if getAllAlerts().length === 0}
							<div class="text-center py-16">
								<i class="fas fa-bell text-4xl text-gray-400 mb-4"></i>
								<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
									No Price Alerts Set
								</h3>
								<p class="text-gray-600 dark:text-gray-400">
									Set up alerts to get notified when tokens hit your target prices
								</p>
							</div>
						{/if}
					</div>
				</TabItem>

				<TabItem value="insights" title="Portfolio Insights">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<!-- Performance distribution -->
						<Card>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
								Performance Distribution
							</h3>
							<div class="space-y-2">
								{#if watchlist.length > 0}
									{@const gainers = watchlist.filter((item) => item.metrics.priceChange24h > 0)}
									{@const losers = watchlist.filter((item) => item.metrics.priceChange24h < 0)}

									<div class="flex items-center justify-between">
										<span class="text-green-600 dark:text-green-400">Gainers</span>
										<span class="font-medium">{gainers.length}</span>
									</div>
									<div class="flex items-center justify-between">
										<span class="text-red-600 dark:text-red-400">Losers</span>
										<span class="font-medium">{losers.length}</span>
									</div>
									<div class="flex items-center justify-between">
										<span class="text-gray-600 dark:text-gray-400">Neutral</span>
										<span class="font-medium"
											>{watchlist.length - gainers.length - losers.length}</span
										>
									</div>
								{/if}
							</div>
						</Card>

						<!-- Token types -->
						<Card>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Token Types</h3>
							<div class="space-y-2">
								{#if watchlist.length > 0}
									{@const tokenTypes = watchlist.reduce(
										(acc, item) => {
											acc[item.token.type] = (acc[item.token.type] || 0) + 1;
											return acc;
										},
										{} as Record<string, number>
									)}

									{#each Object.entries(tokenTypes) as [type, count]}
										<div class="flex items-center justify-between">
											<span class="text-gray-900 dark:text-white">{type}</span>
											<span class="font-medium">{count}</span>
										</div>
									{/each}
								{/if}
							</div>
						</Card>
					</div>
				</TabItem>
			</Tabs>
		</div>
	</div>
</Modal>

<!-- Alert dialog -->
<Modal bind:open={showAlertDialog} size="md">
	<div class="p-6">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create Price Alert</h3>
		{#if alertToken}
			<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
				Set an alert for {alertToken.symbol}
			</p>
		{/if}

		<div class="space-y-4">
			<div>
				<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
					Alert Type
				</label>
				<Select bind:value={newAlert.condition}>
					<option value="above">Price goes above</option>
					<option value="below">Price goes below</option>
					<option value="change_above">Daily change above</option>
					<option value="change_below">Daily change below</option>
				</Select>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
					Target Value
				</label>
				<Input
					type="number"
					bind:value={newAlert.value}
					placeholder="Enter target value"
					step="0.01"
				/>
			</div>
		</div>

		<div class="flex justify-end gap-2 mt-6">
			<Button color="alternative" on:click={() => (showAlertDialog = false)}>Cancel</Button>
			<Button color="purple" on:click={saveAlert} disabled={!newAlert.condition || !newAlert.value}>
				Create Alert
			</Button>
		</div>
	</div>
</Modal>

<style>
	:global(.watchlist-modal .modal-content) {
		max-width: 95vw !important;
		height: 90vh !important;
	}
</style>
