<script lang="ts">
	import { Button, Spinner, Badge } from 'flowbite-svelte';
	import { Button as DsButton } from '$lib/ds';
	import { fade } from 'svelte/transition';
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
</script>

<!-- Keep legacy DOM event directives to preserve the original event timing. -->
<!-- Market Overview Header -->
<!-- Main Market Info -->
<div class="mb-6">
	<!-- Bottom Row: Token Info, Price, and Controls -->
	<div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
		<!-- Left Side: Token Info and Price -->
		<div class="flex items-center gap-6">
			<!-- Token Info -->
			<div class="flex items-center gap-4">
				<!-- Token Image/Icon -->
				{#if (selectedToken?.symbol || 'VOI') === 'VOI'}
					<!-- VOI Logo -->
					<!-- svelte-ignore event_directive_deprecated -->
					<img
						src="/icons/voi-token.png"
						alt="VOI logo"
						class="w-16 h-16 rounded-2xl object-cover bg-white"
						on:error={(e) => {
							(e.currentTarget as HTMLImageElement).style.display = 'none';
							(e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
						}}
					/>
					<div
						class="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center"
						style="display: none;"
					>
						<i class="fas fa-coins text-white text-2xl"></i>
					</div>
				{:else if tokenInfo?.imageUrl}
					<!-- Token Image from tokenInfo -->
					<!-- svelte-ignore event_directive_deprecated -->
					<img
						src={tokenInfo.imageUrl}
						alt="{selectedToken?.symbol || 'VOI'} logo"
						class="w-16 h-16 rounded-2xl object-cover bg-white"
						on:error={(e) => {
							(e.currentTarget as HTMLImageElement).style.display = 'none';
							(e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
						}}
					/>
					<div
						class="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center"
						style="display: none;"
					>
						<i class="fas fa-coins text-white text-2xl"></i>
					</div>
				{:else if data.pageMetaTags?.imageUrl && data.pageMetaTags.imageUrl !== 'https://voirewards.com/android-chrome-192x192.png'}
					<!-- Fallback to page meta image -->
					<!-- svelte-ignore event_directive_deprecated -->
					<img
						src={data.pageMetaTags.imageUrl}
						alt="{selectedToken?.symbol || 'VOI'} logo"
						class="w-16 h-16 rounded-2xl object-cover bg-white"
						on:error={(e) => {
							(e.currentTarget as HTMLImageElement).style.display = 'none';
							(e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
						}}
					/>
					<div
						class="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center"
						style="display: none;"
					>
						<i class="fas fa-coins text-white text-2xl"></i>
					</div>
				{:else}
					<!-- Default fallback icon -->
					<div
						class="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center"
					>
						<i class="fas fa-coins text-white text-2xl"></i>
					</div>
				{/if}

				<div>
					<div class="flex items-center gap-3 mb-1">
						<h1 class="text-3xl font-bold text-gray-900 dark:text-white">
							{selectedToken?.symbol || 'VOI'}
						</h1>
						<Badge class="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
							{realMarketData.length} Markets
						</Badge>
					</div>
					<p class="text-lg text-gray-600 dark:text-gray-400">
						Volume-weighted average price across all exchanges
					</p>
				</div>
			</div>

			<!-- Price Display -->
			<div class="text-center lg:text-right" transition:fade={{ duration: 300 }}>
				<div class="flex items-center justify-center lg:justify-end gap-3">
					{#if fetchingMarketData}
						<div class="animate-pulse bg-gray-300 dark:bg-gray-600 rounded h-12 w-32"></div>
						<Spinner size="6" />
					{:else}
						<div
							class="text-4xl font-bold text-gray-900 dark:text-white"
							transition:fade={{ duration: 400 }}
						>
							{formatPrice(displayPrice)}
						</div>
					{/if}
				</div>
				<div class="text-sm text-gray-500 dark:text-gray-400">
					{#if fetchingMarketData}
						Updating price data...
					{:else}
						Last updated: {new Date().toLocaleTimeString()}
					{/if}
				</div>
			</div>
		</div>

		<!-- Right Side Controls -->
		<div class="flex items-center gap-3">
			<DsButton variant="ghost" size="sm" aria-haspopup="dialog" onclick={onSearch}>
				<svg
					class="h-4 w-4"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" />
				</svg>
				Search
				{#if commandPaletteShortcut}
					<kbd
						class="hidden whitespace-nowrap rounded-ds-sm border border-line bg-surface-2 px-2 text-label text-ink-muted md:inline"
						>{commandPaletteShortcut}</kbd
					>
				{/if}
			</DsButton>
			<TokenSelector {selectedToken} {allTokens} on:tokenSelect={handleTokenSelect} />

			<Button size="sm" color="alternative" on:click={refreshData} disabled={isRefreshing}>
				<i class="fas fa-sync-alt {isRefreshing ? 'animate-spin' : ''} mr-2"></i>
				Refresh
			</Button>
		</div>
	</div>
</div>

<style>
	/* Enhanced styles for the new components */
	kbd {
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Monaco, Consolas, 'Liberation Mono',
			'Courier New', monospace;
		font-size: 0.75rem;
		font-weight: 500;
	}
</style>
