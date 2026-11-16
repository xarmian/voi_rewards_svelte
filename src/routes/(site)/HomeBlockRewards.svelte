<script lang="ts">
	import Card from '$lib/ds/Card/Card.svelte';
	import Button from '$lib/ds/Button/Button.svelte';
	import InlineAlert from '$lib/ds/InlineAlert/InlineAlert.svelte';
	import StatTile from '$lib/ds/StatTile/StatTile.svelte';
	import Sparkline from '$lib/ds/Sparkline/Sparkline.svelte';
	import BlockRewardsPausedAlert from '$lib/ds/BlockRewardsPausedAlert/BlockRewardsPausedAlert.svelte';
	import RealtimeTestingBadge from '$lib/ds/RealtimeTestingBadge/RealtimeTestingBadge.svelte';
	import { MISSING } from '$lib/ds/format';
	import type { DataState } from '$lib/ds/types';
	import { createReadSource } from '$lib/wallet/read';
	import { loadBlockRewardFunding, loadNetworkBlockRewardsDaily } from '$lib/wallet/blockRewards';
	import { BLOCK_REWARDS_UNKNOWN_TEXT } from '$lib/rewards/blockRewardStatus';
	import { REALTIME_BLOCK_REWARDS_TITLE } from '$lib/rewards/blockRewardLabels';
	import {
		createHomeBlockRewardsState,
		todayDetail,
		todayRow,
		voiFigure,
		weekSeries
	} from '$lib/home/blockRewards';

	let { now }: { now?: Date } = $props();
	const SPARKLINE_LABEL = 'Daily real-time block rewards, last 7 complete UTC days (VOI)';
	let sources = $state(createHomeBlockRewardsState());
	const readers = {
		// Thirty days, as on the wallet and analytics views, so all share one cached read.
		network: createReadSource(
			(_, force) => loadNetworkBlockRewardsDaily(30, force),
			(result) => (sources.network = result)
		),
		funding: createReadSource(
			() => loadBlockRewardFunding(),
			(result) => (sources.funding = result)
		)
	};
	type ReaderKey = keyof typeof readers;
	function retry(source: ReaderKey) {
		return readers[source].load('network', true);
	}
	function refresh() {
		for (const key of Object.keys(readers) as ReaderKey[]) void retry(key);
	}
	// Effects do not run on the server, so the server render stays the loading state.
	$effect(() => {
		for (const reader of Object.values(readers)) void reader.load('network');
		return () => {
			for (const reader of Object.values(readers)) reader.dispose();
		};
	});

	let funding = $derived(sources.funding.value);
	let fundingPaused = $derived(funding?.funding === 'paused');
	let fundingUnknown = $derived(
		sources.funding.state === 'error' || funding?.funding === 'unknown'
	);
	let rows = $derived(sources.network.value ?? []);
	// Rows are matched to UTC dates as of the read, so a set from before UTC midnight is not shown as today.
	let readAt = $derived(now ?? new Date(sources.network.asOf ?? Date.now()));
	let today = $derived(todayRow(rows, readAt));
	let networkState: DataState = $derived(sources.network.state);
	let bonus = $derived(funding?.bonus ?? null);
	let bonusState: DataState = $derived(
		sources.funding.state === 'loading'
			? 'loading'
			: sources.funding.state === 'error' || bonus === null
				? 'error'
				: sources.funding.state
	);
	let series = $derived(weekSeries(rows, readAt));
</script>

<Card title={REALTIME_BLOCK_REWARDS_TITLE}>
	{#snippet actions()}<div class="flex min-w-0 flex-wrap items-center justify-end gap-2">
			<RealtimeTestingBadge /><Button variant="soft" onclick={refresh}
				>Refresh real-time block rewards</Button
			>
		</div>{/snippet}
	<div class="min-w-0 space-y-4">
		{#if fundingPaused}
			<BlockRewardsPausedAlert />
		{:else if fundingUnknown}
			<InlineAlert
				tone="warn"
				message={BLOCK_REWARDS_UNKNOWN_TEXT}
				onretry={() => void retry('funding')}
			/>
		{/if}
		<div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
			<StatTile
				label="Today (UTC)"
				value={today ? voiFigure(today.amount / 1e6) : MISSING}
				unit="VOI"
				detail={today ? todayDetail(today) : undefined}
				state={networkState}
				asOf={sources.network.asOf}
				onretry={() => void retry('network')}
			/>
			<StatTile
				label="Current bonus"
				value={bonus === null ? MISSING : voiFigure(bonus / 1e6)}
				unit="VOI"
				detail="per block"
				state={bonusState}
				asOf={sources.funding.asOf}
				onretry={() => void retry('funding')}
			/>
		</div>
		<figure class="min-w-0">
			<Sparkline
				values={series}
				label={SPARKLINE_LABEL}
				state={networkState}
				asOf={sources.network.asOf}
				onretry={() => void retry('network')}
			/>
			<figcaption class="mt-1 text-label text-ink-muted">Last 7 complete days (UTC)</figcaption>
		</figure>
	</div>
</Card>
