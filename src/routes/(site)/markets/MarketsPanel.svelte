<script lang="ts">
	import { Button, Card, Chip, DataTable, InlineAlert } from '$lib/ds';
	import type { Column, SortState } from '$lib/ds/DataTable/types';
	import {
		formatPrice,
		formatCurrency,
		formatPercentage,
		normalizePair
	} from '$lib/markets/format';
	import type { MarketDataState } from '$lib/markets/marketDataLoader';
	import type { PageData } from './$types';

	type Market = PageData['marketData'][number];
	interface Props {
		voiUsdStatus: MarketDataState['voiUsdStatus'];
		voiUsdAsOf: string | null;
		tokenAnalytics: PageData['tokenAnalytics'];
		sortedMarketData: PageData['marketData'];
		searchQuery: string;
		onSearchQueryChange: (query: string) => void;
		filterMarkets: (query: string) => void;
		sort?: SortState;
		selectedTradingPairId: number | null;
		onRowClick: (market: Market) => void;
		marketDataError: string | null;
		refreshData: () => Promise<void>;
		isRefreshing: boolean;
		fetchingMarketData?: boolean;
	}

	let {
		voiUsdStatus,
		voiUsdAsOf,
		tokenAnalytics,
		sortedMarketData,
		searchQuery,
		onSearchQueryChange,
		filterMarkets,
		sort = $bindable({ key: 'tvl', dir: 'desc' }),
		selectedTradingPairId,
		onRowClick,
		marketDataError,
		refreshData,
		isRefreshing,
		fetchingMarketData = false
	}: Props = $props();

	const columns: Column<Market>[] = [
		{ key: 'pair', header: 'Pair', priority: 1, cell: pairCell },
		{ key: 'exchange', header: 'Exchange', priority: 2, cell: exchangeCell },
		{
			key: 'price',
			header: 'Price',
			priority: 2,
			numeric: true,
			align: 'end',
			sortable: true,
			sortValue: (row) => row.price,
			cell: priceCell
		},
		{
			key: 'tvl',
			header: 'TVL (USD)',
			priority: 2,
			numeric: true,
			align: 'end',
			sortable: true,
			sortValue: (row) => row.tvl,
			cell: tvlCell
		},
		{
			key: 'volume_24h',
			header: '24h Volume',
			priority: 3,
			numeric: true,
			align: 'end',
			sortable: true,
			sortValue: (row) => row.volume_24h,
			cell: volumeCell
		},
		{
			key: 'change',
			header: '24h Change',
			priority: 3,
			numeric: true,
			align: 'end',
			cell: changeCell
		}
	];
	let tableState = $derived(
		sortedMarketData.length > 0
			? 'ready'
			: fetchingMarketData
				? 'loading'
				: marketDataError
					? 'error'
					: 'empty'
	);
	const rowKey = (market: Market) =>
		`${market.exchange}-${market.network}-${market.trading_pair_id}-${market.pair}`;
</script>

{#snippet pairCell(market: Market)}
	<div class="flex flex-wrap items-center gap-2">
		{#if market.pool_url}
			<a
				href={market.pool_url}
				target="_blank"
				rel="noopener noreferrer"
				class="text-accent hover:underline"
			>
				{normalizePair(market.pair)}<span class="sr-only"> (opens in a new tab)</span>
			</a>
		{/if}
		<Button
			variant="ghost"
			size="sm"
			aria-label={`Show ${normalizePair(market.pair)} chart`}
			aria-pressed={selectedTradingPairId === market.trading_pair_id}
			class="min-w-10 [@media(pointer:coarse)]:min-w-11"
			onclick={() => onRowClick(market)}
		>
			{#if market.pool_url}<i class="fas fa-chart-line" aria-hidden="true"
				></i>{:else}{normalizePair(market.pair)}{/if}
		</Button>
	</div>
{/snippet}
{#snippet exchangeCell(market: Market)}
	<Chip tone="neutral" label={market.exchange === 'humble' ? 'Humble' : market.exchange} />
{/snippet}
{#snippet priceCell(market: Market)}{formatPrice(market.price)}{/snippet}
{#snippet tvlCell(market: Market)}{formatCurrency(market.tvl)}{/snippet}
{#snippet volumeCell(market: Market)}{market.volume_24h === null
		? '—'
		: market.volume_24h
			? formatCurrency(market.volume_24h)
			: '-'}{/snippet}
{#snippet changeCell(market: Market)}
	<span
		class={(market.price_change_percentage_24h ?? 0) > 0
			? 'text-ok'
			: (market.price_change_percentage_24h ?? 0) < 0
				? 'text-danger'
				: 'text-ink-muted'}>{formatPercentage(market.price_change_percentage_24h)}</span
	>
{/snippet}

<div class="col-span-full min-w-0">
	<Card title="Token Markets">
		{#snippet actions()}<Chip
				tone="neutral"
				label="Shown markets"
				count={sortedMarketData.length}
			/>{/snippet}
		<div class="mb-4 space-y-3">
			{#if voiUsdStatus === 'stale'}
				<InlineAlert
					tone="warn"
					message={`VOI/USD reference is stale (as of ${voiUsdAsOf ? new Date(voiUsdAsOf).toLocaleString() : 'unknown time'}). USD values may be out of date.`}
				/>
			{:else if voiUsdStatus === 'invalid' || voiUsdStatus === 'unavailable'}
				<InlineAlert
					tone="warn"
					message="VOI/USD reference unavailable. USD values for VOI-quoted pools are missing."
				/>
			{/if}
			{#if tokenAnalytics?.partial}<InlineAlert
					tone="warn"
					message="Some analytics are unavailable."
				/>{/if}
			<div class="flex flex-wrap items-end gap-2">
				<div class="min-w-0 flex-1">
					<label for="market-search" class="mb-1 block text-label text-ink">Filter markets</label>
					<input
						id="market-search"
						type="text"
						value={searchQuery}
						oninput={(event) => {
							onSearchQueryChange(event.currentTarget.value);
							filterMarkets(event.currentTarget.value);
						}}
						placeholder="Search markets, exchanges, networks..."
						class="block min-h-10 w-full rounded-ds-sm border border-edge bg-surface px-3 py-2 text-ink placeholder:text-ink-muted"
					/>
				</div>
				{#if searchQuery}
					<Button
						variant="ghost"
						size="sm"
						aria-label="Clear market filter"
						onclick={() => {
							onSearchQueryChange('');
							filterMarkets('');
						}}>Clear</Button
					>
				{/if}
			</div>
			<div>
				<label for="market-sort" class="mb-1 block text-label text-ink">Sort markets</label>
				<select
					id="market-sort"
					class="min-h-10 max-w-full rounded-ds-sm border border-edge bg-surface px-3 py-2 text-ink"
					value={`${sort.key}:${sort.dir}`}
					onchange={(event) => {
						const [key, dir] = event.currentTarget.value.split(':');
						sort = { key, dir: dir as SortState['dir'] };
					}}
				>
					{#each columns.filter((column) => column.sortable) as column (column.key)}
						<option value={`${column.key}:desc`}>{column.header}: descending</option>
						<option value={`${column.key}:asc`}>{column.header}: ascending</option>
					{/each}
				</select>
			</div>
		</div>
		<div aria-busy={fetchingMarketData || undefined}>
			{#if fetchingMarketData || isRefreshing}<p
					role="status"
					class="mb-2 text-label text-ink-muted"
				>
					Updating markets...
				</p>{/if}
			<DataTable
				{columns}
				rows={sortedMarketData}
				{rowKey}
				caption="Token markets"
				rowName={(market) =>
					`${normalizePair(market.pair)} on ${market.exchange} (${market.network})`}
				bind:sort
				expandable
				state={tableState}
				onretry={refreshData}
				emptyText={searchQuery.trim() ? 'No markets match this filter.' : 'No markets available.'}
			/>
		</div>
	</Card>
</div>
