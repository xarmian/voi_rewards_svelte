<script lang="ts">
	import { Button, Chip } from '$lib/ds';
	import TokenSelector from '$lib/components/TokenSelector.svelte';
	import { formatPrice } from '$lib/markets/format';
	import { quoteAsOfLabel } from '$lib/markets/framing';
	import { logoVisible } from '$lib/markets/logoState';
	import type { UniqueToken } from '../../api/tokens/+server';
	import type { PageData } from './$types';

	interface Props {
		selectedToken: UniqueToken | null;
		tokenInfo: { imageUrl?: string } | null;
		data: PageData;
		realMarketData: PageData['marketData'];
		fetchingMarketData: boolean;
		displayPrice: number;
		quoteAsOf?: string | null;
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
		quoteAsOf = null,
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
	// The URL that last failed to load. A different token's logo is shown again without remounting.
	let failedUrl = $state<string | null>(null);
	let showLogo = $derived(logoVisible(imageUrl, failedUrl));
</script>

<div class="flex min-w-0 flex-col gap-bento text-ink lg:flex-row lg:items-start lg:justify-between">
	<div class="flex min-w-0 flex-col gap-bento">
		<div class="flex min-w-0 items-center gap-4">
			<div class="shrink-0">
				<!-- Keyed on the URL so each logo gets its own element, and the handler records the URL
				     this element was created for, never the current one. -->
				{#key imageUrl}
					{#if showLogo}
						{@const url = imageUrl ?? null}
						<img
							src={imageUrl}
							alt="{symbol} logo"
							class="h-16 w-16 rounded-ds-md bg-surface object-cover"
							onerror={() => (failedUrl = url)}
						/>
					{:else}
						<div
							class="flex h-16 w-16 items-center justify-center rounded-ds-md bg-accent-soft text-accent"
						>
							<i class="fas fa-coins text-2xl" aria-hidden="true"></i>
						</div>
					{/if}
				{/key}
			</div>
			<div class="min-w-0">
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<h1 class="min-w-0 break-words text-title">{symbol} markets</h1>
					<Chip label="Beta" />
				</div>
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
			<p class="mt-2 text-label text-ink-muted">{quoteAsOfLabel(quoteAsOf)}</p>
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
