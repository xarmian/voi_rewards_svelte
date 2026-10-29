<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { ariaSortFor } from '$lib/a11y/keyboard';
	import {
		formatPrice,
		formatCurrency,
		formatPercentage,
		normalizePair
	} from '$lib/markets/format';
	import type { MarketDataState } from '$lib/markets/marketDataLoader';
	import type { PageData } from './$types';

	interface Props {
		voiUsdStatus: MarketDataState['voiUsdStatus'];
		voiUsdAsOf: string | null;
		tokenAnalytics: PageData['tokenAnalytics'];
		sortedMarketData: PageData['marketData'];
		searchQuery: string;
		onSearchQueryChange: (query: string) => void;
		filterMarkets: (query: string) => void;
		sortColumn: string;
		sortDirection: 'asc' | 'desc';
		sortData: (column: string) => void;
		selectedTradingPairId: number | null;
		onRowClick: (market: PageData['marketData'][number]) => void;
		marketDataError: string | null;
		refreshData: () => Promise<void>;
		isRefreshing: boolean;
	}

	let {
		voiUsdStatus,
		voiUsdAsOf,
		tokenAnalytics,
		sortedMarketData,
		searchQuery,
		onSearchQueryChange,
		filterMarkets,
		sortColumn,
		sortDirection,
		sortData,
		selectedTradingPairId,
		onRowClick,
		marketDataError,
		refreshData,
		isRefreshing
	}: Props = $props();
</script>

<!-- Keep legacy DOM event directives to preserve the original event timing. -->
<div
	class="lg:col-span-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
	style="height: 640px;"
>
	<div
		class="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-600 flex-shrink-0"
	>
		{#if voiUsdStatus === 'stale'}
			<p class="text-sm text-gray-600 dark:text-gray-400">
				VOI/USD reference is stale (as of {voiUsdAsOf
					? new Date(voiUsdAsOf).toLocaleString()
					: 'unknown time'}). USD values may be out of date.
			</p>
		{:else if voiUsdStatus === 'invalid' || voiUsdStatus === 'unavailable'}
			<p class="text-sm text-gray-600 dark:text-gray-400">
				VOI/USD reference unavailable. USD values for VOI-quoted pools are missing.
			</p>
		{/if}
		{#if tokenAnalytics?.partial}
			<p class="text-sm text-gray-600 dark:text-gray-400">Some analytics are unavailable.</p>
		{/if}

		<div class="flex items-center justify-between mb-4">
			<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Token Markets</h2>
			<span class="text-sm text-gray-600 dark:text-gray-400">{sortedMarketData.length} active</span>
		</div>

		<!-- Search Bar -->
		<div class="relative">
			<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
				<i class="fas fa-search text-gray-400"></i>
			</div>
			<!-- svelte-ignore event_directive_deprecated -->
			<input
				id="market-search"
				type="text"
				bind:value={() => searchQuery, onSearchQueryChange}
				on:input={() => filterMarkets(searchQuery)}
				placeholder="Search markets, exchanges, networks..."
				class="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:focus:ring-purple-400 dark:focus:border-purple-400"
			/>
			{#if searchQuery}
				<!-- Preserve the existing unlabeled clear button. -->
				<!-- svelte-ignore a11y_consider_explicit_label -->
				<!-- svelte-ignore event_directive_deprecated -->
				<button
					type="button"
					on:click={() => {
						onSearchQueryChange('');
						filterMarkets('');
					}}
					class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
				>
					<i class="fas fa-times"></i>
				</button>
			{/if}
		</div>
	</div>
	<div class="flex-1 overflow-auto min-h-0">
		<table class="w-full">
			<thead
				class="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 sticky top-0 z-10"
			>
				<tr>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>Pair</th
					>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>Exchange</th
					>
					<th
						scope="col"
						aria-sort={ariaSortFor(sortColumn, 'price', sortDirection)}
						class="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
					>
						<!-- svelte-ignore event_directive_deprecated -->
						<button
							type="button"
							class="block w-full px-6 py-3 text-left uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
							on:click={() => sortData('price')}
						>
							Price
							{#if sortColumn === 'price'}
								<i
									aria-hidden="true"
									class="fas fa-sort-{sortDirection === 'asc' ? 'up' : 'down'} ml-1"
								></i>
							{/if}
						</button>
					</th>
					<th
						scope="col"
						aria-sort={ariaSortFor(sortColumn, 'tvl', sortDirection)}
						class="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
					>
						<!-- svelte-ignore event_directive_deprecated -->
						<button
							type="button"
							class="block w-full px-6 py-3 text-left uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
							on:click={() => sortData('tvl')}
						>
							TVL (USD)
							{#if sortColumn === 'tvl'}
								<i
									aria-hidden="true"
									class="fas fa-sort-{sortDirection === 'asc' ? 'up' : 'down'} ml-1"
								></i>
							{/if}
						</button>
					</th>
					<th
						scope="col"
						aria-sort={ariaSortFor(sortColumn, 'volume_24h', sortDirection)}
						class="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
					>
						<!-- svelte-ignore event_directive_deprecated -->
						<button
							type="button"
							class="block w-full px-6 py-3 text-left uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
							on:click={() => sortData('volume_24h')}
						>
							24h Volume
							{#if sortColumn === 'volume_24h'}
								<i
									aria-hidden="true"
									class="fas fa-sort-{sortDirection === 'asc' ? 'up' : 'down'} ml-1"
								></i>
							{/if}
						</button>
					</th>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>24h Change</th
					>
				</tr>
			</thead>
			<tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
				{#each sortedMarketData as market}
					<!-- svelte-ignore event_directive_deprecated -->
					<tr
						class="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
						on:click={() => onRowClick(market)}
					>
						<td class="px-6 py-3 whitespace-nowrap text-sm">
							<div class="flex items-center gap-2">
								{#if market.pool_url}
									<!-- svelte-ignore event_directive_deprecated -->
									<a
										href={market.pool_url}
										target="_blank"
										rel="noopener noreferrer"
										class="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
										on:click|stopPropagation
									>
										{normalizePair(market.pair)}
										<i class="fas fa-external-link-alt text-xs opacity-50" aria-hidden="true"></i>
									</a>
									<!-- svelte-ignore event_directive_deprecated -->
									<button
										type="button"
										aria-label={`Show ${normalizePair(market.pair)} chart`}
										aria-pressed={selectedTradingPairId === market.trading_pair_id}
										class="p-1 text-purple-600 dark:text-purple-400 rounded focus-visible:ring-2 focus-visible:ring-focus"
										on:click|stopPropagation={() => onRowClick(market)}
									>
										<i class="fas fa-chart-line" aria-hidden="true"></i>
									</button>
								{:else}
									<!-- svelte-ignore event_directive_deprecated -->
									<button
										type="button"
										aria-label={`Show ${normalizePair(market.pair)} chart`}
										aria-pressed={selectedTradingPairId === market.trading_pair_id}
										class="text-gray-900 dark:text-white rounded focus-visible:ring-2 focus-visible:ring-focus"
										on:click|stopPropagation={() => onRowClick(market)}
									>
										{normalizePair(market.pair)}
									</button>
								{/if}
							</div>
						</td>
						<td class="px-6 py-3 whitespace-nowrap text-sm">
							<span
								class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {market.exchange ===
								'humble'
									? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
									: market.exchange === 'nomadex'
										? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
										: market.exchange === 'Humble'
											? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
											: market.exchange === 'Nomadex'
												? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
												: market.exchange === 'Tinyman' || market.exchange.startsWith('Tinyman')
													? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
													: market.exchange === 'PactFi'
														? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
														: market.exchange === 'Uniswap'
															? 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300'
															: market.exchange === 'MEXC'
																? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'
																: 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300'}"
							>
								{market.exchange === 'humble'
									? 'Humble'
									: market.exchange === 'nomadex'
										? 'Nomadex'
										: market.exchange}
							</span>
						</td>
						<td class="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>{formatPrice(market.price)}</td
						>
						<td class="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>{formatCurrency(market.tvl)}</td
						>
						<td class="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>{market.volume_24h ? formatCurrency(market.volume_24h) : '-'}</td
						>
						<td class="px-6 py-3 whitespace-nowrap text-sm">
							<span
								class={(market.price_change_percentage_24h ?? 0) > 0
									? 'text-green-600 dark:text-green-400'
									: (market.price_change_percentage_24h ?? 0) < 0
										? 'text-red-600 dark:text-red-400'
										: 'text-gray-600 dark:text-gray-400'}
							>
								{formatPercentage(market.price_change_percentage_24h)}
							</span>
						</td>
					</tr>
				{:else}
					{#if marketDataError}
						<tr>
							<td colspan="6" class="text-center py-12">
								<p class="text-gray-600 dark:text-gray-400 mb-3">
									Couldn't load markets for this token.
								</p>
								<Button size="sm" color="alternative" on:click={refreshData} disabled={isRefreshing}
									>Retry</Button
								>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	/* Improved focus indicators for accessibility */
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid #8b5cf6;
		outline-offset: 2px;
	}
</style>
