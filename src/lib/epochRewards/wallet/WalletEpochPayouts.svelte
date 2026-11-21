<script lang="ts">
	import ChartFrame from '$lib/ds/ChartFrame/ChartFrame.svelte';
	import LineChart from '$lib/ds/charts/LineChart.svelte';
	import { cumulativePayouts, recordedPayouts, type EpochRewardsState } from './rewards';

	// The wallet Rewards tab's "Recorded epoch rewards" chart, moved here unchanged.
	let {
		epoch,
		at,
		retry
	}: {
		epoch: EpochRewardsState;
		at: Date;
		retry: (source: 'payouts') => unknown;
	} = $props();
	let recorded = $derived(epoch.payouts.value ? recordedPayouts(epoch.payouts.value) : []);
	let cumulative = $derived(epoch.payouts.value ? cumulativePayouts(epoch.payouts.value) : []);
	let payoutData = $derived({
		columns: ['UTC receipt', 'Transaction ID', 'Amount VOI', 'Running VOI'],
		rows: recorded.map((payment) => [
			payment.timestamp,
			payment.txid,
			payment.amount,
			payment.running
		]),
		caption:
			epoch.payouts.value?.complete === false
				? 'Known recorded payments subtotal; incomplete. Line withheld until Retry succeeds.'
				: 'Cumulative recorded payments; missing or unreturned payments are not included. Source: get_account_transactions_multi.'
	});
	let payoutMax = $derived(Math.max(1, ...cumulative.map((payment) => payment.running)) * 1.1);
</script>

<div class="min-w-0 space-y-3 lg:col-span-4">
	{#if epoch.payouts.value?.complete && !recorded.length}<p class="text-label text-ink-muted">
			No recorded epoch rewards returned.
		</p>{/if}
	<ChartFrame
		title="Recorded epoch rewards"
		summary="Cumulative recorded VOI payments, matched rewards senders and this recipient"
		data={payoutData}
		state={epoch.payouts.value?.complete === false
			? 'error'
			: epoch.payouts.value && !recorded.length
				? 'empty'
				: epoch.payouts.state}
		onretry={() => void retry('payouts')}
		asOf={epoch.payouts.asOf}
		x={{
			kind: 'time',
			domain: [
				new Date(recorded[0]?.timestamp ?? at.getTime() - 86400000),
				new Date(Math.max(at.getTime(), Date.parse(recorded.at(-1)?.timestamp ?? '') || 0))
			]
		}}
		y={{ domain: [0, payoutMax] }}
		height={240}
	>
		{#snippet children(ctx)}<LineChart
				{ctx}
				points={cumulative.map((payment) => ({
					x: new Date(payment.timestamp),
					y: payment.running
				}))}
				area={false}
				tone="accent"
			/>{/snippet}
	</ChartFrame>
</div>
