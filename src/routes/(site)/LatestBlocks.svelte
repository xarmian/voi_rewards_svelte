<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, Chip, InlineAlert, StatusPill } from '$lib/ds';
	import { ago, comma, shortAddr } from '$lib/ds/format';
	import { createRecentBlocks, type RecentState } from '$lib/home/recent';
	import { getEnvoiNames } from '$lib/utils/envoi';
	let latestState = $state<RecentState>({ blocks: null, error: false, lastSuccess: null });
	let visible = $state(true);
	let expired = $state(false);
	let clock = $state(0);
	let names = $state<Record<string, string>>({});
	let retry = $state(() => {});
	let paused = $derived(!visible || expired || latestState.error);
	onMount(() => {
		let active = true;
		let freshness: ReturnType<typeof setTimeout>;
		const requested = new Set<string>();
		const store = createRecentBlocks({ fetch, now: Date.now, document });
		retry = () => {
			void store.retry();
		};
		const visibility = () => {
			visible = document.visibilityState === 'visible';
			clock = Date.now();
		};
		visibility();
		document.addEventListener('visibilitychange', visibility);
		const unsubscribe = store.subscribe((value) => {
			latestState = value;
			clock = Date.now();
			clearTimeout(freshness);
			expired = value.lastSuccess !== null && clock - value.lastSuccess >= 300000;
			if (value.lastSuccess !== null && !expired)
				freshness = setTimeout(
					() => {
						expired = true;
						clock = Date.now();
					},
					300000 - (clock - value.lastSuccess)
				);
			const addresses = [...new Set((value.blocks ?? []).map((row) => row.proposer))].filter(
				(addr) => !requested.has(addr)
			);
			addresses.forEach((addr) => requested.add(addr));
			if (addresses.length)
				void getEnvoiNames(addresses).then((found) => {
					if (active)
						names = {
							...names,
							...Object.fromEntries(found.map((row) => [row.address, row.name]))
						};
				});
		});
		return () => {
			active = false;
			unsubscribe();
			clearTimeout(freshness);
			document.removeEventListener('visibilitychange', visibility);
		};
	});
</script>

{#snippet actions()}<StatusPill
		tone={paused ? 'warn' : 'info'}
		label={paused ? 'Paused' : 'Live'}
	/>{/snippet}
<Card title="Latest blocks" {actions}>
	{#if latestState.blocks === null && latestState.error}
		<InlineAlert message="Unable to load latest blocks." onretry={retry} />
	{:else if latestState.blocks === null}
		<div aria-busy="true">
			<p class="sr-only">Loading latest blocks…</p>
			<ul aria-label="Latest blocks" class="space-y-3">
				{#each [0, 1, 2, 3, 4] as row (row)}<li
						aria-hidden="true"
						class="h-8 rounded-ds-xs bg-surface-2"
					></li>{/each}
			</ul>
		</div>
	{:else}
		<ul aria-label="Latest blocks">
			{#each latestState.blocks as block (block.block)}
				<li
					class="flex min-w-0 flex-wrap items-center gap-2 border-b border-line py-2.5 text-sm last:border-b-0"
				>
					<Chip label={`#${comma(block.block)}`} />
					<a href="/wallet/{block.proposer}" class="min-w-0 flex-1 break-all text-accent"
						>{names[block.proposer] ?? shortAddr(block.proposer)}</a
					>
					<time datetime={block.timestamp} class="text-label text-ink-muted"
						>{ago(block.timestamp, clock)}</time
					>
				</li>
			{/each}
		</ul>
	{/if}
</Card>
