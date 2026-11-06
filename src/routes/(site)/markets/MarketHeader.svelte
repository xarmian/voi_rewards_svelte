<script lang="ts">
	import { Button, Chip } from '$lib/ds';
	import TokenSelector from '$lib/components/TokenSelector.svelte';
	import { formatPrice } from '$lib/markets/format';
	import type { UniqueToken } from '../../api/tokens/+server';
	import type { PageData } from './$types';

	interface Props {
		selectedToken: UniqueToken | null;
		tokenInfo: { imageUrl?: string } | null;
		data: PageData;
		realMarketData: PageData['marketData'];
		fetchingMarketData: boolean;
		displayPrice: number;
		commandPaletteShortcut: string;
		allTokens: UniqueToken[];
		handleTokenSelect: (event: CustomEvent<UniqueToken>) => void;
		refreshData: () => Promise<void>;
		isRefreshing: boolean;
		onSearch: () => void;
	}

	let {
		selectedToken,
		tokenInfo,
		data,
		realMarketData,
		fetchingMarketData,
		displayPrice,
		commandPaletteShortcut,
		allTokens,
		handleTokenSelect,
		refreshData,
		isRefreshing,
		onSearch
	}: Props = $props();

	let symbol = $derived(selectedToken?.symbol || 'VOI');
	let imageUrl = $derived(
		symbol === 'VOI'
			? '/icons/voi-token.png'
			: tokenInfo?.imageUrl ||
					(data.pageMetaTags?.imageUrl !== 'https://voirewards.com/android-chrome-192x192.png'
						? data.pageMetaTags?.imageUrl
						: undefined)
	);
</script>

<div class="flex min-w-0 flex-col gap-bento text-ink lg:flex-row lg:items-start lg:justify-between">
	<div class="flex min-w-0 flex-col gap-bento">
		<div class="flex min-w-0 items-center gap-4">
			<div class="shrink-0">
				{#if imageUrl}
					<img
						src={imageUrl}
						alt="{symbol} logo"
						class="h-16 w-16 rounded-ds-md bg-surface object-cover"
						onerror={(event) => {
							(event.currentTarget as HTMLImageElement).style.display = 'none';
							(event.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
						}}
					/>
				{/if}
				<div
					class="h-16 w-16 items-center justify-center rounded-ds-md bg-accent-soft text-accent"
					style:display={imageUrl ? 'none' : 'flex'}
				>
					<i class="fas fa-coins text-2xl" aria-hidden="true"></i>
				</div>
			</div>
			<div class="min-w-0">
				<h1 class="break-words text-title">{symbol} markets</h1>
				<div class="mt-2">
					<Chip tone="neutral" label="Loaded markets" count={realMarketData.length} />
				</div>
			</div>
		</div>
		<div aria-busy={fetchingMarketData || undefined}>
			{#if fetchingMarketData}
				<p role="status" class="text-label text-ink-muted">Updating price data...</p>
			{:else}
				<p class="break-words text-stat num">{formatPrice(displayPrice)}</p>
			{/if}
			<p class="mt-2 text-body text-ink-muted">
				Volume-weighted average price across all exchanges
			</p>
		</div>
	</div>
	<div class="flex w-full min-w-0 flex-col gap-bento lg:w-96 lg:shrink-0">
		<div class="flex flex-wrap gap-2">
			<Button
				variant="ghost"
				size="sm"
				aria-label="Search tokens"
				aria-haspopup="dialog"
				onclick={onSearch}
			>
				<i class="fas fa-search" aria-hidden="true"></i>
				Search tokens
				{#if commandPaletteShortcut}
					<kbd
						class="hidden whitespace-nowrap rounded-ds-sm border border-line bg-surface-2 px-2 text-micro text-ink-muted md:inline"
						aria-hidden="true">{commandPaletteShortcut}</kbd
					>
				{/if}
			</Button>
			<Button
				variant="soft"
				size="sm"
				aria-label="Refresh markets"
				aria-busy={isRefreshing || undefined}
				onclick={refreshData}
				disabled={isRefreshing}
			>
				<i class="fas fa-sync-alt" aria-hidden="true"></i>
				Refresh markets
			</Button>
		</div>
		<TokenSelector {selectedToken} {allTokens} on:tokenSelect={handleTokenSelect} />
	</div>
</div>
