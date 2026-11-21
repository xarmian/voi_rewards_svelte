<script lang="ts">
	import { StatTile } from '$lib/ds/StatTile';
	import { comma } from '$lib/ds/format';
	import type { Loaded } from '$lib/server/loaded';
	import { accountsDetail, headlineValues } from '../headline';
	import type { EpochHomeData } from '../home.server';
	let {
		epoch,
		onlineCount,
		onretry
	}: { epoch: EpochHomeData; onlineCount: Promise<Loaded<number>>; onretry: () => void } = $props();
	let headline = $derived(epoch.headline.state === 'error' ? undefined : epoch.headline.value);
	let figures = $derived(headlineValues(headline));
	let history = $derived(epoch.aprHistory.state === 'error' ? [] : epoch.aprHistory.value);
	let wallets = $derived(history.flatMap((row) => (row.wallets === null ? [] : [row.wallets])));
</script>

<div class="grid min-w-0 md:col-span-1 lg:col-span-3">
	<StatTile
		label="Earning accounts"
		icon="♙"
		value={comma(headline?.earningAccounts)}
		trend={wallets}
		href="/analytics"
		state={epoch.headline.state}
		{onretry}
		asOf={epoch.headline.state === 'stale' ? epoch.headline.asOf : undefined}
	>
		{#snippet detail()}
			{#await onlineCount}<span aria-busy="true" class="inline-block h-4 w-24 rounded-ds-xs bg-grid"
					><span class="sr-only">Loading online accounts</span></span
				>
			{:then count}{accountsDetail(count) ?? ''}{/await}
		{/snippet}
	</StatTile>
</div>
<div class="grid min-w-0 md:col-span-1 lg:col-span-3">
	<StatTile
		label="Blocks this epoch"
		icon="▦"
		value={figures.blocks}
		detail={`≈ ${figures.voiPerBlock} VOI per block · heading for ~${figures.projectedBlocks}`}
		href="/analytics"
		state={epoch.headline.state}
		{onretry}
		asOf={epoch.headline.state === 'stale' ? epoch.headline.asOf : undefined}
	/>
</div>
