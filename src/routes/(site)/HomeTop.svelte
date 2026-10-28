<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { Card, ChartFrame, InlineAlert, LineChart, SearchBox, StatTile } from '$lib/ds';
	import { ago, comma, MISSING, pct } from '$lib/ds/format';
	import { annotationsFor } from '$lib/data/chartEvents';
	import { accountsDetail, headlineValues, onlineStakeTile, priceTile } from '$lib/home/headline';
	import type { DashboardData } from '$lib/server/home';
	let { data }: { data: DashboardData } = $props();
	const retry = () => {
		void invalidateAll();
	};
	let headline = $derived(data.headline.state === 'error' ? undefined : data.headline.value);
	let figures = $derived(headlineValues(headline));
	let history = $derived(data.aprHistory.state === 'error' ? [] : data.aprHistory.value);
	let points = $derived(history.map((row) => ({ x: row.epoch, y: row.apr })));
	let aprs = $derived(history.map((row) => row.apr).filter(Number.isFinite));
	let wallets = $derived(history.flatMap((row) => (row.wallets === null ? [] : [row.wallets])));
	let progress = $derived(
		headline && Number.isFinite(headline.elapsedDays)
			? Math.round(headline.elapsedDays * 10) / 10
			: undefined
	);
</script>

<div
	class="on-hero bg-hero text-on-hero rounded-b-hero pt-[132px] pb-[70px] md:pb-[84px] lg:pt-[120px]"
>
	<div class="container-page text-center">
		<h1 class="mx-auto max-w-3xl text-display">Check your Voi node's rewards in seconds</h1>
		<p class="mx-auto mt-4 max-w-2xl text-lede text-on-hero-muted">
			Status, key expiry, blocks and estimated payouts for any account or staking contract.
			{#if data.headline.state === 'ready'}Staking currently earns <strong>{figures.apr} APR</strong
				>.{/if}
		</p>
		<div class="relative mx-auto mt-6 max-w-2xl text-start">
			<SearchBox
				variant="hero"
				tone="hero"
				onsubmit={(address) => {
					void goto('/wallet/' + address);
				}}
			/>
		</div>
	</div>
</div>

<div class="container-page relative -mt-[60px] grid gap-bento md:grid-cols-2 lg:grid-cols-12">
	<Card
		variant="hero"
		span={{ lg: 5, md: 2 }}
		title={headline ? `Staking APR · epoch ${headline.epoch}` : 'Staking APR'}
	>
		{#if data.headline.state === 'error'}
			<InlineAlert message={data.headline.message} onretry={retry} />
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
			{#if data.headline.state === 'stale'}<p class="mt-2 text-label text-on-hero-muted">
					As of {ago(data.headline.asOf)}
				</p>{/if}
		{/if}
	</Card>
	<div class="min-w-0 md:col-span-2 lg:col-span-7">
		<ChartFrame
			title="APR by epoch"
			summary="Staking APR over the last 26 epochs."
			state={data.aprHistory.state}
			onretry={retry}
			asOf={data.aprHistory.state === 'stale' ? data.aprHistory.asOf : undefined}
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
	<div class="grid min-w-0 md:col-span-1 lg:col-span-3">
		{#await data.onlineStake}
			<StatTile label="Online stake" icon="ϟ" {...onlineStakeTile(data.headline)} onretry={retry} />
		{:then stake}
			<StatTile
				label="Online stake"
				icon="ϟ"
				{...onlineStakeTile(data.headline, stake)}
				onretry={retry}
			/>
		{/await}
	</div>
	<div class="grid min-w-0 md:col-span-1 lg:col-span-3">
		<StatTile
			label="Earning accounts"
			icon="♙"
			value={comma(headline?.earningAccounts)}
			trend={wallets}
			href="/analytics"
			state={data.headline.state}
			onretry={retry}
			asOf={data.headline.state === 'stale' ? data.headline.asOf : undefined}
		>
			{#snippet detail()}
				{#await data.onlineCount}<span
						aria-busy="true"
						class="inline-block h-4 w-24 rounded-ds-xs bg-grid"
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
			state={data.headline.state}
			onretry={retry}
			asOf={data.headline.state === 'stale' ? data.headline.asOf : undefined}
		/>
	</div>
	<div class="grid min-w-0 md:col-span-1 lg:col-span-3">
		{#await data.price}
			<StatTile label="VOI price" icon="$" value={MISSING} state="loading" />
		{:then price}
			<StatTile label="VOI price" icon="$" {...priceTile(price)} onretry={retry} />
		{/await}
	</div>
</div>
