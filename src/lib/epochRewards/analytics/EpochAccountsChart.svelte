<script lang="ts">
	import ChartFrame from '$lib/ds/ChartFrame/ChartFrame.svelte';
	import LineChart from '$lib/ds/charts/LineChart.svelte';
	import { compact, comma as num } from '$lib/ds/format';
	import { domain, freshness, status } from '$lib/network/view';
	import type { EpochAnalytics } from './model';
	import { epochRange } from './series';

	let { model }: { model: EpochAnalytics } = $props();
	const accountRows = $derived(epochRange($model.epochs?.rows ?? [], '26'));
</script>

<ChartFrame
	title="Accounts earning by epoch"
	summary="Number of rewarded accounts by epoch over the last 26 available epochs. These are rewarded accounts, not accounts online now."
	state={status(
		$model.epochs,
		$model.busy,
		accountRows.map((r) => r.accounts)
	)}
	onretry={() => void model.retry()}
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
