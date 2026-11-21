<script lang="ts">
	import ChartFrame from '$lib/ds/ChartFrame/ChartFrame.svelte';
	import LineChart from '$lib/ds/charts/LineChart.svelte';
	import Tabs from '$lib/ds/Tabs/Tabs.svelte';
	import { compact } from '$lib/ds/format';
	import { available, domain, freshness, pct, status } from '$lib/network/view';
	import type { EpochAnalytics } from './model';
	import { epochRange } from './series';

	let { model }: { model: EpochAnalytics } = $props();
	const aprRows = $derived(epochRange($model.epochs?.rows ?? [], $model.range));
	const current = $derived($model.epochs?.current);
	const previous = $derived($model.epochs?.previous);
</script>

<ChartFrame
	title="APR by epoch"
	summary={`Annual percentage rate in percent for ${aprRows.length} epochs. Current epoch ${current?.epoch ?? 'unavailable'} is in progress: ${available(current?.apr, pct)}. Previous completed: ${available(previous?.apr, pct)}.`}
	state={status(
		$model.epochs,
		$model.busy,
		aprRows.map((r) => r.apr)
	)}
	onretry={() => void model.retry()}
	freshnessText={freshness($model.epochs)}
	data={{
		columns: ['Epoch', 'APR (%)', 'Status'],
		rows: aprRows.map((r) => [r.epoch, r.apr ?? 'Unavailable', r.status]),
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
				aria-busy={$model.busy ? 'true' : undefined}
			>
				<div>
					<dt class="text-ink-muted">
						{current ? `Epoch ${current.epoch} · in progress` : 'Current epoch'}
					</dt>
					<dd class="num min-h-8 text-h2">
						{#if $model.busy}<span class="block h-8 w-24 rounded-ds-xs bg-grid"
								><span class="sr-only">Loading current APR…</span></span
							>{:else}{available(current?.apr, pct)}{/if}
					</dd>
				</div>
				<div>
					<dt class="text-ink-muted">
						Previous completed{previous ? ` · ${previous.epoch}` : ''}
					</dt>
					<dd class="num min-h-8 font-bold">
						{#if $model.busy}<span class="block h-8 w-24 rounded-ds-xs bg-grid"
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
