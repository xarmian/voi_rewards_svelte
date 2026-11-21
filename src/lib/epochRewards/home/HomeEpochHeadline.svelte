<script lang="ts">
	import { Card } from '$lib/ds/Card';
	import { ChartFrame } from '$lib/ds/ChartFrame';
	import { InlineAlert } from '$lib/ds/InlineAlert';
	import { LineChart } from '$lib/ds/charts';
	import { ago, comma, MISSING, pct } from '$lib/ds/format';
	import { annotationsFor } from '$lib/data/chartEvents';
	import { retryKeepingFocus } from '$lib/ds/retryFocus';
	import { headlineValues } from '../headline';
	import type { EpochHomeData } from '../home.server';
	let { epoch, onretry }: { epoch: EpochHomeData; onretry: () => void } = $props();
	let aprRegion: HTMLDivElement | undefined = $state();
	let headline = $derived(epoch.headline.state === 'error' ? undefined : epoch.headline.value);
	let figures = $derived(headlineValues(headline));
	// history slot: regate on EPOCH_HISTORY_VIEWABLE when a snapshot source exists.
	let history = $derived(epoch.aprHistory.state === 'error' ? [] : epoch.aprHistory.value);
	let points = $derived(history.map((row) => ({ x: row.epoch, y: row.apr })));
	let aprs = $derived(history.map((row) => row.apr).filter(Number.isFinite));
	let progress = $derived(
		headline && Number.isFinite(headline.elapsedDays)
			? Math.round(headline.elapsedDays * 10) / 10
			: undefined
	);
</script>

<Card
	variant="hero"
	span={{ lg: 5, md: 2 }}
	title={headline ? `Staking APR · epoch ${headline.epoch}` : 'Staking APR'}
>
	<!-- Retry swaps the alert for the figures once the data reloads; the region keeps focus in the card. -->
	<div bind:this={aprRegion} tabindex="-1" class="focus:outline-none">
		{#if epoch.headline.state === 'error'}
			<InlineAlert
				message={epoch.headline.message}
				onretry={retryKeepingFocus(() => aprRegion, onretry)}
			/>
		{:else}
			<p class="num text-hero-num">{figures.apr}</p>
			<p class="mt-2 text-label text-on-hero-muted">
				1M VOI online earns ≈ {figures.perMillion} VOI this epoch
			</p>
			{#if headline?.prevApr !== null && headline?.prevApr !== undefined}
				<p class="mt-2 text-label text-on-hero-muted">
					Previous epoch: {pct(headline.prevApr)} APR
				</p>
			{/if}
			{#if progress !== undefined}
				<div
					role="progressbar"
					aria-valuenow={progress}
					aria-valuemin="0"
					aria-valuemax="7"
					aria-label="Epoch progress"
					class="mt-4 h-2 rounded-full bg-on-hero-surface"
				>
					<div
						class="h-full rounded-full bg-on-hero"
						style:width={`${(progress / 7) * 100}%`}
					></div>
				</div>
			{/if}
			<p class="mt-2 text-label text-on-hero-muted">
				Day {figures.elapsedDays} of 7 · {figures.pool} VOI pool · {headline?.rangeLabel}
			</p>
			{#if epoch.headline.state === 'stale'}<p class="mt-2 text-label text-on-hero-muted">
					As of {ago(epoch.headline.asOf)}
				</p>{/if}
		{/if}
	</div>
</Card>
<div class="min-w-0 md:col-span-2 lg:col-span-7">
	<ChartFrame
		title="APR by epoch"
		summary="Staking APR over the last 26 epochs."
		state={epoch.aprHistory.state}
		{onretry}
		asOf={epoch.aprHistory.state === 'stale' ? epoch.aprHistory.asOf : undefined}
		annotations={annotationsFor('apr', 'epoch')}
		data={{
			columns: ['Epoch', 'APR', 'Rewarded accounts'],
			rows: history.map((row) => [row.epoch, pct(row.apr), row.wallets ?? MISSING]),
			caption: 'Epoch APR and rewarded accounts from epoch-detail.'
		}}
		x={{ kind: 'linear', domain: [history[0]?.epoch ?? 1, history.at(-1)?.epoch ?? 26] }}
		y={{
			domain: aprs.length ? [Math.min(...aprs) - 0.5, Math.max(...aprs) + 0.5] : [0, 1],
			format: (n) => pct(n, 1)
		}}
		describe={(index) =>
			`Epoch ${history[index].epoch}: ${pct(history[index].apr)} APR · ${comma(history[index].wallets)} rewarded accounts`}
		height={180}
	>
		{#snippet children(ctx)}<LineChart {ctx} {points} format={pct} />{/snippet}
	</ChartFrame>
</div>
