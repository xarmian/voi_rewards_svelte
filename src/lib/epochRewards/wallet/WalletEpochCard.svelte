<script lang="ts">
	import type { DataState } from '$lib/ds/types';
	import type { WalletSummary } from '$lib/wallet/summary';
	import type { WalletEpoch, WalletEpochSummary } from './summary';
	import Card from '$lib/ds/Card/Card.svelte';
	import InlineAlert from '$lib/ds/InlineAlert/InlineAlert.svelte';
	import { comma, compact, pct, usd } from '$lib/ds/format';
	import { retryKeepingFocus } from '$lib/ds/retryFocus';

	// The Overview's "This epoch so far" card, moved here unchanged.
	let {
		summary,
		current,
		historyState,
		price,
		onrefresh
	}: {
		summary: WalletSummary & WalletEpochSummary;
		current: WalletEpoch | null;
		historyState: DataState;
		price: number | null;
		onrefresh?: () => Promise<void> | void;
	} = $props();
	const loading = $derived(summary.state === 'loading');
	const failed = $derived(summary.state === 'error');
	const stakingUnavailable = $derived(summary.contractSet === 'unavailable');
	let epochRegion: HTMLDivElement | undefined = $state();
</script>

<Card title="This epoch so far" variant="hero" span={{ lg: 7 }}>
	<div bind:this={epochRegion} tabindex="-1" class="focus:outline-none">
		{#if loading}
			<div aria-busy="true" class="space-y-4 py-3">
				<span class="sr-only">Loading this epoch…</span>
				<div aria-hidden="true" class="h-14 rounded bg-on-hero-surface"></div>
				<div aria-hidden="true" class="h-6 rounded bg-on-hero-surface"></div>
			</div>
		{:else if failed || stakingUnavailable}<InlineAlert
				message="This epoch unavailable. Earned rewards and luck unavailable."
				onretry={retryKeepingFocus(() => epochRegion, onrefresh)}
			/>
		{:else}
			<p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<strong class="text-hero-num" title={String(summary.current.reward ?? '')}
					>{summary.current.reward === null ? '—' : `≈ ${compact(summary.current.reward, 1)}`}
					<span class="text-h2">VOI</span></strong
				>
				<span class="text-on-hero-muted"
					>{summary.current.reward !== null && price !== null
						? usd(summary.current.reward * price)
						: 'USD unavailable'}</span
				>
			</p>
			<p class="mt-2 text-sm text-on-hero-muted">
				{comma(summary.current.blocks)} blocks · {pct(
					summary.current.share === null ? null : summary.current.share * 100
				)} of the network · {pct(
					summary.current.ratio === null ? null : summary.current.ratio * 100,
					0
				)} of expected
			</p>
			{#if summary.tooEarly}<p class="mt-2 text-label">
					Too early to project rewards: fewer than 50 expected blocks.
				</p>{/if}
			<div
				class="my-4 h-2 rounded-full bg-on-hero-surface"
				role="progressbar"
				aria-label={`Epoch ${summary.current.epoch} elapsed`}
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Math.round(summary.current.progress * 100)}
			>
				<div
					class="h-full rounded-full bg-on-hero"
					style:width={`${summary.current.progress * 100}%`}
				></div>
			</div>
			<dl class="grid grid-cols-2 gap-4 text-label sm:grid-cols-3">
				<div>
					<dt class="text-on-hero-muted">Staked online</dt>
					<dd class="text-h2">{compact(summary.stakedOnline)} VOI</dd>
				</div>
				<div>
					<dt class="text-on-hero-muted">Earned, {summary.history.length || 12} epochs</dt>
					<dd class="text-h2">
						{historyState === 'error' ? 'Unavailable' : `≈ ${compact(summary.earnedHistory)} VOI`}
					</dd>
				</div>
				<div>
					<dt class="text-on-hero-muted">{summary.history.length || 12}-epoch luck</dt>
					<dd class="text-h2">
						{historyState === 'error'
							? 'Unavailable'
							: pct(summary.historyRatio === null ? null : summary.historyRatio * 100, 0)}
					</dd>
				</div>
			</dl>
			<details class="mt-4 text-label">
				<summary class="cursor-pointer">View current epoch data</summary>
				<dl class="mt-2 grid grid-cols-1 gap-2">
					<div>
						<dt>Produced · live epoch rows</dt>
						<dd>{comma(summary.current.blocks)} blocks</dd>
					</div>
					<div>
						<dt>
							Expected · live network blocks × algod online balance ÷ eligible stake (algod supply
							minus excluded stake)
						</dt>
						<dd>
							{comma(summary.current.expected, 2)} blocks = {comma(current?.networkBlocks)} × {comma(
								summary.stakedOnline,
								6
							)} ÷ {comma(current?.onlineStake, 6)}
						</dd>
					</div>
					<div>
						<dt>Reward estimate · epoch pool ÷ projected network blocks × produced</dt>
						<dd>
							{comma(summary.current.reward, 6)} VOI; pool {comma(current?.pool)} VOI. This is an estimate,
							not a recorded reward.
						</dd>
					</div>
				</dl>
			</details>
		{/if}
	</div>
</Card>
