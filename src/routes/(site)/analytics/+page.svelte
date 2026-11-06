<script lang="ts">
	import { onMount } from 'svelte';
	import ChartFrame from '$lib/ds/ChartFrame/ChartFrame.svelte';
	import LineChart from '$lib/ds/charts/LineChart.svelte';
	import Tabs from '$lib/ds/Tabs/Tabs.svelte';
	import StakeSplit from '$lib/network/StakeSplit.svelte';
	import { compact, comma as num } from '$lib/ds/format';
	import { annotationsFor } from '$lib/data/chartEvents';
	import { chainStatus } from '$lib/stores/chainStatus';
	import { createNetwork } from '$lib/network/model';
	import { epochRange, freshnessText, type Resource } from '$lib/network/series';
	import type { DataState } from '$lib/ds/types';
	import type { XSpec } from '$lib/ds/charts/types';

	let { model = createNetwork() }: { model?: ReturnType<typeof createNetwork> } = $props();
	onMount(() => {
		void model.load();
	});
	const aprRows = $derived(epochRange($model.epochs?.rows ?? [], $model.range));
	const accountRows = $derived(epochRange($model.epochs?.rows ?? [], '26'));
	const stakeRows = $derived($model.stake?.rows ?? []);
	const priceRows = $derived($model.price?.rows ?? []);
	const txRows = $derived($model.transactions?.rows ?? []);
	const current = $derived($model.epochs?.current);
	const previous = $derived($model.epochs?.previous);
	const pct = (value: number) => `${num(value, 2)}%`;
	const available = (value: number | null | undefined, format: (n: number) => string = String) =>
		value == null ? 'Unavailable' : format(value);
	const freshness = (resource: Resource<unknown> | null) =>
		resource ? freshnessText(resource) : undefined;
	function status(
		resource: Resource<unknown> | null,
		busy: boolean,
		values: (number | null)[]
	): DataState {
		if (busy) return 'loading';
		if (!resource) return 'error';
		if (resource.status === 'ready' && !values.some((v) => v !== null)) return 'empty';
		return resource.status;
	}
	function domain(values: (number | null)[], log = false): [number, number] {
		const finite = values.filter(
			(v): v is number => v !== null && Number.isFinite(v) && (!log || v > 0)
		);
		if (!finite.length) return log ? [1, 10] : [0, 1];
		const max = Math.max(...finite);
		if (!log) return [0, max > 0 ? max * 1.1 : 1];
		const min = Math.min(...finite);
		return min === max ? [min / 1.1, max * 1.1] : [min, max];
	}
	function timeAxis(rows: { date: string }[]): XSpec {
		const start = new Date(`${rows[0]?.date ?? '1970-01-01'}T00:00:00Z`);
		const end = new Date(`${rows.at(-1)?.date ?? '1970-01-02'}T00:00:00Z`);
		return { kind: 'time', domain: [start, end > start ? end : new Date(+start + 86400000)] };
	}
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
		content="Voi network rewards, online stake, rewarded accounts, VOI price and transaction activity."
	/></svelte:head
>

<div class="network container-page space-y-6 py-8">
	<div>
		<h1 class="text-h1 text-ink">Network</h1>
		<p class="mt-2 text-sm text-ink-muted">
			{$chainStatus.round === null ? 'Block unavailable' : `Block ${num($chainStatus.round)}`} · Chain
			status is context; each resource has its own data time below.
		</p>
		<p class="mt-3 text-body text-ink-muted">
			Follow rewards by epoch, then the stake competing for them.
		</p>
	</div>

	<ChartFrame
		title="APR by epoch"
		summary={`Annual percentage rate in percent for ${aprRows.length} epochs. Current epoch ${current?.epoch ?? 'unavailable'} is in progress: ${available(current?.apr, pct)}. Previous completed: ${available(previous?.apr, pct)}.`}
		state={status(
			$model.epochs,
			$model.busy.epochs,
			aprRows.map((r) => r.apr)
		)}
		onretry={() => void model.retry('epochs')}
		freshnessText={freshness($model.epochs)}
		data={{
			columns: ['Epoch', 'APR (%)', 'Status'],
			rows: aprRows.map((r) => [
				r.epoch,
				r.apr ?? 'Unavailable',
				r.inProgress ? 'in progress' : 'completed'
			]),
			caption:
				'Annual percentage rate (APR, %) by epoch. The current epoch is in progress and its values are provisional. Missing observations remain gaps.'
		}}
		x={{ kind: 'band', values: aprRows.map((r) => r.epoch) }}
		y={{ domain: domain(aprRows.map((r) => r.apr)), format: (n) => `${compact(n)}%` }}
		height={230}
	>
		{#snippet actions()}
			<div class="space-y-3">
				<dl
					class="flex flex-wrap gap-x-6 gap-y-2 text-sm"
					aria-busy={$model.busy.epochs ? 'true' : undefined}
				>
					<div>
						<dt class="text-ink-muted">
							{current ? `Epoch ${current.epoch} · in progress` : 'Current epoch'}
						</dt>
						<dd class="num min-h-8 text-h2">
							{#if $model.busy.epochs}<span class="block h-8 w-24 rounded-ds-xs bg-grid"
									><span class="sr-only">Loading current APR…</span></span
								>{:else}{available(current?.apr, pct)}{/if}
						</dd>
					</div>
					<div>
						<dt class="text-ink-muted">
							Previous completed{previous ? ` · ${previous.epoch}` : ''}
						</dt>
						<dd class="num min-h-8 font-bold">
							{#if $model.busy.epochs}<span class="block h-8 w-24 rounded-ds-xs bg-grid"
									><span class="sr-only">Loading previous APR…</span></span
								>{:else}{available(previous?.apr, pct)}{/if}
						</dd>
					</div>
				</dl>
				<Tabs
					variant="segmented"
					label="APR epoch range"
					options={[
						{ value: '12', label: '12' },
						{ value: '26', label: '26' },
						{ value: 'all', label: 'All' }
					]}
					value={$model.range}
					onchange={model.setRange}
				/>
			</div>
		{/snippet}
		{#snippet children(ctx)}
			<LineChart
				{ctx}
				points={aprRows.map((r) => ({ x: r.epoch, y: r.apr ?? NaN }))}
				area={false}
				format={(value) => `${pct(value)}${aprRows.at(-1)?.inProgress ? ' · in progress' : ''}`}
			/>
		{/snippet}
	</ChartFrame>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{$model.announcement}</p>

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
		title="Accounts earning by epoch"
		summary="Number of rewarded accounts by epoch over the last 26 available epochs. These are rewarded accounts, not accounts online now."
		state={status(
			$model.epochs,
			$model.busy.epochs,
			accountRows.map((r) => r.accounts)
		)}
		onretry={() => void model.retry('epochs')}
		freshnessText={freshness($model.epochs)}
		data={{
			columns: ['Epoch', 'Rewarded accounts'],
			rows: accountRows.map((r) => [r.epoch, r.accounts ?? 'Unavailable']),
			caption:
				'Rewarded accounts (participating_wallets), last 26 epochs. These are rewarded accounts, not accounts online now. Missing counts remain unavailable; the current epoch is provisional.'
		}}
		x={{ kind: 'band', values: accountRows.map((r) => r.epoch) }}
		y={{ domain: domain(accountRows.map((r) => r.accounts)), format: compact }}
		height={230}
	>
		{#snippet children(ctx)}<LineChart
				{ctx}
				points={accountRows.map((r) => ({ x: r.epoch, y: r.accounts ?? NaN }))}
				area={false}
				format={(v) => `${num(v)} accounts`}
			/>{/snippet}
	</ChartFrame>

	<StakeSplit
		resource={$model.epochs}
		loading={$model.busy.epochs}
		onretry={() => void model.retry('epochs')}
	/>

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
			format: (v) => v.toExponential(1)
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
			rows: txRows.map((r) => [r.date, r.actual, r.projected ?? 'Not projected']),
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
				points={txRows.map((r) => ({ x: r.date, y: r.actual }))}
				area={false}
				format={(v) => `${num(v)} actual`}
			/>
			{#each txRows.filter((r) => r.projected !== null) as row (row.date)}
				<line
					x1={ctx.x(row.date)}
					x2={ctx.x(row.date)}
					y1={ctx.y(row.actual)}
					y2={ctx.y(row.projected!)}
					class="stroke-ink"
					stroke-width="2.5"
					stroke-dasharray="6 4"
				/>
				<text
					x={ctx.x(row.date) - 6}
					y={Math.max(ctx.margin.top + 12, ctx.y(row.projected!) - 8)}
					text-anchor="end"
					font-size="11"
					class="fill-ink">projected full {$model.period}: {num(row.projected!)}</text
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
