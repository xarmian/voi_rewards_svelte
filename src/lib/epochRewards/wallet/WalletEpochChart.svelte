<script lang="ts">
	import type { DataState } from '$lib/ds/types';
	import type { WalletSummary } from '$lib/wallet/summary';
	import type { WalletEpochSummary } from './summary';
	import ChartFrame from '$lib/ds/ChartFrame/ChartFrame.svelte';
	import BarsVsExpected from '$lib/ds/charts/BarsVsExpected.svelte';
	import { annotationsFor } from '$lib/data/chartEvents';
	import { pct } from '$lib/ds/format';

	// The Overview's "Blocks vs expected" chart, moved here unchanged.
	let {
		summary,
		historyState,
		asOf,
		onrefresh
	}: {
		summary: WalletSummary & WalletEpochSummary;
		historyState: DataState;
		asOf?: string;
		onrefresh?: () => Promise<void> | void;
	} = $props();
	const loading = $derived(summary.state === 'loading');
	const failed = $derived(summary.state === 'error');
	const stakingUnavailable = $derived(summary.contractSet === 'unavailable');
	const bars = $derived(
		summary.history.map((epoch) => ({
			x: epoch.epoch,
			value: epoch.blocks ?? NaN,
			expected: epoch.expected ?? NaN
		}))
	);
	const chartState = $derived(
		loading
			? 'loading'
			: failed || stakingUnavailable
				? 'error'
				: historyState === 'error'
					? 'error'
					: summary.history.length
						? summary.state
						: 'empty'
	);
</script>

<div class="min-w-0 lg:col-span-8">
	<ChartFrame
		title="Blocks vs expected"
		summary="Blocks produced and expected over the last 12 complete epochs. Expected uses current online balances as an approximation of historical stake."
		state={chartState}
		{asOf}
		onretry={onrefresh}
		legend={[
			{ label: 'Produced', swatch: 'fill' },
			{ label: '>115% of expected', swatch: 'hi' },
			{ label: 'Expected', swatch: 'expected' }
		]}
		annotations={annotationsFor('blocksVsExpected', 'epoch')}
		x={{ kind: 'band', values: bars.map((bar) => bar.x) }}
		y={{
			domain: [
				0,
				Math.max(
					1,
					...bars.flatMap((bar) => [bar.value, Number.isFinite(bar.expected) ? bar.expected : 0])
				) * 1.2
			]
		}}
		data={{
			columns: ['Epoch', 'Produced', 'Expected', 'Luck', 'Est. reward (VOI)'],
			rows: summary.history.map((epoch) => [
				epoch.epoch,
				epoch.blocks ?? 'Unavailable',
				epoch.expected ?? 'Unavailable',
				pct(epoch.ratio === null ? null : epoch.ratio * 100),
				epoch.reward ?? 'Unavailable'
			]),
			caption:
				'Produced: proposers API epoch rows. Expected = network blocks × current online balances (algod) ÷ eligible online stake (epoch-detail); historical stake is approximate. Reward = epoch pool (getTokensByEpoch) × block share. Luck = produced ÷ expected. Complete epochs only; the current card uses live rows.'
		}}
	>
		{#snippet children(ctx)}<BarsVsExpected {ctx} {bars} />{/snippet}
	</ChartFrame>
</div>
