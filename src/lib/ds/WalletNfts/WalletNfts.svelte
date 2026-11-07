<script lang="ts">
	import type { NFTToken } from '$lib/types/assets';
	import type { DataState } from '../types';
	import { nftUrl, nftImage } from '$lib/wallet/holdings';
	import Card from '../Card/Card.svelte';
	import Button from '../Button/Button.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	let {
		pageAddress,
		tokens,
		state: dataState = 'idle',
		partial = false,
		metadataLoading = false,
		onexpand,
		onretry
	}: {
		pageAddress: string;
		tokens?: NFTToken[];
		state?: DataState | 'idle';
		partial?: boolean;
		metadataLoading?: boolean;
		onexpand?: () => void;
		onretry?: () => void;
	} = $props();
	let expanded = $state(false);
	let limit = $state(12);
	let address = $state<string>();
	$effect(() => {
		if (address !== pageAddress) {
			address = pageAddress;
			expanded = false;
			limit = 12;
		}
	});
	function toggle() {
		expanded = !expanded;
		if (expanded) onexpand?.();
	}
</script>

<Card title="NFTs" span={{ lg: 12, md: 2 }}>
	<Button variant="ghost" onclick={toggle} aria-expanded={expanded} aria-controls="wallet-nfts-grid"
		>{expanded ? 'Hide collectibles' : 'Show collectibles'}{tokens
			? ` · ${tokens.length} NFTs`
			: ''}</Button
	>
	{#if expanded}
		<div id="wallet-nfts-grid" class="mt-4 min-w-0">
			{#if dataState === 'stale'}<InlineAlert
					tone="warn"
					message="NFT refresh failed. Showing the last retrieved ownership."
					{onretry}
				/>{/if}
			{#if dataState === 'loading' && !tokens}<div
					aria-busy="true"
					class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
				>
					<span class="sr-only">Loading NFT ownership…</span>{#each [1, 2, 3, 4] as n (n)}<div
							aria-hidden="true"
							class="aspect-square rounded-ds-sm bg-grid"
						></div>{/each}
				</div>
			{:else if dataState === 'error'}<InlineAlert message="NFT ownership unavailable" {onretry} />
			{:else if tokens}
				{#if partial}<InlineAlert
						tone="warn"
						message="Some NFT metadata is unavailable. Ownership is preserved."
						{onretry}
					/>{/if}
				{#if metadataLoading}<p role="status" class="text-sm text-ink-muted">
						Loading collectible metadata…
					</p>{/if}
				{#if !tokens.length}<p class="text-sm text-ink-muted">No NFTs returned for this address.</p>
				{:else}<ul class="mt-3 grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
						{#each tokens.slice(0, limit) as token (`${token.contractId}:${token.tokenId}`)}<li
								class="min-w-0 rounded-ds-sm border border-line bg-surface-2 p-2"
							>
								<a
									href={nftUrl(token.contractId, token.tokenId)}
									target="_blank"
									rel="noopener noreferrer"
									class="block min-w-0 break-words text-sm text-accent underline"
									><img
										src={nftImage(token.imageUrl, token.metadataURI)}
										alt=""
										loading="lazy"
										class="mb-2 aspect-square w-full rounded-ds-xs object-cover"
										onerror={(event) => {
											const img = event.currentTarget as HTMLImageElement;
											img.onerror = null;
											img.src = '/icons/default-token-image.svg';
										}}
									/>{token.name || `NFT #${token.tokenId}`}</a
								>{#if token.collection?.name}<p class="mt-1 break-words text-sm text-ink-muted">
										{token.collection.name}
									</p>{/if}
							</li>{/each}
					</ul>{/if}
				{#if tokens.length > limit}<div class="mt-4">
						<Button variant="soft" onclick={() => (limit += 12)}>Show more collectibles</Button>
					</div>{/if}
			{/if}
		</div>
	{/if}
</Card>
