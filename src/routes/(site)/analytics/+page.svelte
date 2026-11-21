<script lang="ts">
	import { onMount } from 'svelte';
	import ChartFrame from '$lib/ds/ChartFrame/ChartFrame.svelte';
	import LineChart from '$lib/ds/charts/LineChart.svelte';
	import Tabs from '$lib/ds/Tabs/Tabs.svelte';
	import RealtimeTestingBadge from '$lib/ds/RealtimeTestingBadge/RealtimeTestingBadge.svelte';
	import { compact, comma as num } from '$lib/ds/format';
	import { annotationsFor } from '$lib/data/chartEvents';
	import { chainStatus } from '$lib/stores/chainStatus';
	import { createNetwork } from '$lib/network/model';
	import { domain, freshness, status, timeAxis } from '$lib/network/view';
	import { epochAnalytics } from '$lib/epochRewards/client';
	import {
		EpochAccountsChart,
		EpochAnalyticsLede,
		EpochAprChart,
		StakeSplit
	} from '$lib/epochRewards/components';
	import type { DataState } from '$lib/ds/types';
	import { createReadSource, type Source } from '$lib/wallet/read';
	import {
		loadNetworkBlockRewardsDaily,
		type NetworkBlockRewardDay
	} from '$lib/wallet/blockRewards';
	import { REALTIME_BLOCK_REWARDS_TITLE } from '$lib/rewards/blockRewardLabels';
	import { blockRewardDayRows, blockRewardSummary, shareText } from '$lib/network/blockRewards';

	const model = createNetwork();
	const epochs = epochAnalytics();
	onMount(() => {
		// The epoch read starts first, as it did when one model held every resource.
		void epochs?.load();
		void model.load();
	});
	let blockSource: Source<NetworkBlockRewardDay[]> = $state({ state: 'loading' });
	// Thirty days, as on the home and wallet views, so all share one cached read.
	const blockReader = createReadSource(
		(_, force) => loadNetworkBlockRewardsDaily(30, force),
		(result) => (blockSource = result)
	);
	// Effects do not run on the server, so the server render stays the loading state.
	$effect(() => {
		void blockReader.load('network');
		return () => blockReader.dispose();
	});
	const blockRows = $derived(blockRewardDayRows(blockSource.value ?? []));
	const blockState: DataState = $derived(
		blockSource.state === 'loading' || blockSource.state === 'error'
			? blockSource.state
			: blockRows.length
				? blockSource.state
				: 'empty'
	);
	const stakeRows = $derived($model.stake?.rows ?? []);
	const priceRows = $derived($model.price?.rows ?? []);
	const txRows = $derived($model.transactions?.rows ?? []);
	const txState = $derived(
		status(
			$model.transactions,
			$model.busy.transactions,
			txRows.map((r) => r.actual)
		)
	);
</script>

<svelte:head
	><title>Network | voirewards</title><meta
		name="description"
		content={epochs
			? 'Voi network rewards, online stake, rewarded accounts, VOI price and transaction activity.'
			: 'Voi online stake, real-time block rewards, VOI price and transaction activity.'}
	/></svelte:head
>

<div class="network container-page space-y-6 py-8">
	<div>
		<h1 class="text-h1 text-ink">Network</h1>
		<p class="mt-2 text-sm text-ink-muted">
			{$chainStatus.round === null ? 'Block unavailable' : `Block ${num($chainStatus.round)}`} · Chain
			status is context; each resource has its own data time below.
		</p>
		{#if epochs}<EpochAnalyticsLede />{/if}
	</div>

	{#if epochs}<EpochAprChart model={epochs} />{/if}

	<ChartFrame
		title="Online stake"
		summary="Daily average online stake in VOI over the last 30 UTC calendar days. Missing days are gaps. Oct 8–12: approximately 243 million VOI went offline."
		state={status(
			$model.stake,
			$model.busy.stake,
			stakeRows.map((r) => r.value)
		)}
		onretry={() => void model.retry('stake')}
		freshnessText={freshness($model.stake)}
		annotations={annotationsFor('onlineStake', 'date')}
		data={{
			columns: ['UTC date', 'Online stake (VOI)'],
			rows: stakeRows.map((r) => [r.date, r.value ?? 'Unavailable']),
			caption:
				'Daily average online stake in VOI, last 30 UTC days. Missing calendar days remain gaps. The event note is curated context; history outside this window may be incomplete.'
		}}
		x={timeAxis(stakeRows)}
		y={{ domain: domain(stakeRows.map((r) => r.value)), format: compact }}
		height={230}
	>
		{#snippet children(ctx)}<LineChart
				{ctx}
				points={stakeRows.map((r) => ({ x: r.date, y: r.value ?? NaN }))}
				area={false}
				format={(v) => `${compact(v)} VOI`}
			/>{/snippet}
	</ChartFrame>

	<ChartFrame
		title={`${REALTIME_BLOCK_REWARDS_TITLE} by day`}
		summary={blockRewardSummary(blockRows)}
		state={blockState}
		onretry={() => void blockReader.load('network', true)}
		asOf={blockSource.asOf}
		data={{
			columns: ['UTC date', 'Blocks', 'Blocks rewarded', 'Share rewarded', 'VOI'],
			rows: blockRows.map((r) => [
				r.date,
				num(r.blocks),
				num(r.rewardedBlocks),
				shareText(r.share),
				num(r.voi, 2)
			]),
			caption: `Daily real-time block rewards paid to block proposers in VOI, last 30 UTC days. Today (UTC) is in progress. Days before real-time block rewards started show 0.${epochs ? ' Epoch rewards are separate and not included.' : ''}`
		}}
		x={timeAxis(blockRows)}
		y={{ domain: domain(blockRows.map((r) => r.voi)), format: compact }}
		height={230}
	>
		{#snippet actions()}<RealtimeTestingBadge />{/snippet}
		{#snippet children(ctx)}<LineChart
				{ctx}
				points={blockRows.map((r) => ({ x: r.date, y: r.voi }))}
				area={false}
				format={(v) => `${compact(v)} VOI`}
			/>{/snippet}
	</ChartFrame>

	{#if epochs}<EpochAccountsChart model={epochs} />{/if}

	{#if epochs}
		<StakeSplit
			resource={$epochs?.epochs ?? null}
			loading={$epochs?.busy ?? true}
			onretry={() => void epochs.retry()}
		/>
	{/if}

	<ChartFrame
		title="VOI price"
		summary="VOI price in USD per VOI on a logarithmic y axis, using the daily UTC mean of positive observations from the seven-day history. Missing and nonpositive observations remain gaps."
		state={status(
			$model.price,
			$model.busy.price,
			priceRows.map((r) => r.value)
		)}
		onretry={() => void model.retry('price')}
		freshnessText={freshness($model.price)}
		data={{
			columns: ['UTC date', 'Mean USD / VOI'],
			rows: priceRows.map((r) => [r.date, r.value ?? 'Unavailable']),
			caption:
				'Seven-day source history: daily UTC mean of finite positive prices, in USD per VOI. The y axis is logarithmic. Missing or nonpositive prices remain gaps, never $0; partial days use the observations available.'
		}}
		x={timeAxis(priceRows)}
		y={{
			domain: domain(
				priceRows.map((r) => r.value),
				true
			),
			scale: 'log',
			format: (v) => `$${v.toPrecision(3)}`
		}}
		height={230}
	>
		{#snippet actions()}<a
				href="/markets"
				class="inline-flex min-h-11 items-center text-sm text-accent underline">Explore Markets →</a
			>{/snippet}
		{#snippet children(ctx)}<LineChart
				{ctx}
				points={priceRows.map((r) => ({ x: r.date, y: r.value ?? NaN }))}
				area={false}
				format={(v) => `$${v.toPrecision(5)}`}
			/>{/snippet}
	</ChartFrame>

	<ChartFrame
		title="Transaction activity"
		summary={`Actual transaction totals for ${$model.period === 'day' ? '30 days' : '15 weeks'}. Solid lines show actual totals; dashed lines show projected full ${$model.period} estimates for an incomplete current UTC period.`}
		state={txState}
		onretry={() => void model.retry('transactions')}
		freshnessText={freshness($model.transactions)}
		data={{
			columns: ['UTC bucket start', 'Actual transactions', `projected full ${$model.period}`],
			rows: txRows.map((r) => [r.date, r.actual ?? 'Unavailable', r.projected ?? 'Not projected']),
			caption: `Actual transaction totals (solid), ${$model.period === 'day' ? 'last 30 days' : 'last 15 weeks'}. A dashed estimate is labelled projected full ${$model.period}; it extrapolates elapsed UTC time and is not an actual total. Weeks start Monday UTC.`
		}}
		x={timeAxis(txRows)}
		y={{ domain: domain(txRows.flatMap((r) => [r.actual, r.projected])), format: compact }}
		height={230}
	>
		{#snippet actions()}<Tabs
				variant="segmented"
				label="Transaction period"
				options={[
					{ value: 'day', label: '30 days' },
					{ value: 'week', label: '15 weeks' }
				]}
				value={$model.period}
				onchange={model.setPeriod}
			/>{/snippet}
		{#snippet children(ctx)}
			<LineChart
				{ctx}
				points={txRows.map((r) => ({ x: r.date, y: r.actual ?? NaN }))}
				area={false}
				labelLatest={!txRows.some((r) => r.projected !== null)}
				format={(v) => `${num(v)} actual`}
			/>
			{#each txRows.filter((r) => r.projected !== null) as row (row.date)}
				<line
					x1={ctx.x(row.date)}
					x2={ctx.x(row.date)}
					y1={ctx.y(row.actual!)}
					y2={ctx.y(row.projected!)}
					class="stroke-ink"
					stroke-width="2.5"
					stroke-dasharray="6 4"
				/>
				<text
					x={ctx.x(row.date) - 6}
					y={Math.max(ctx.margin.top + 12, ctx.y(row.projected!) - 14)}
					text-anchor="end"
					font-size="11"
					paint-order="stroke"
					stroke-width="4"
					stroke-linejoin="round"
					class="fill-ink stroke-surface"
					>{num(row.actual!)} actual · projected full {$model.period}: {num(row.projected!)}</text
				>
			{/each}
		{/snippet}
	</ChartFrame>
</div>

<style>
	.network :global([role='group'] > button),
	.network :global(summary) {
		min-height: 44px;
	}
	.network :global(summary) {
		align-content: center;
	}
</style>
