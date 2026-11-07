<script lang="ts">
	import type { SelectedAccount } from '$lib/chain/signerGate';
	import type { WalletEpoch } from '$lib/wallet/summary';
	import {
		buildVestingTimeline,
		summarizeContracts,
		type ContractRow
	} from '$lib/wallet/contracts';
	import type { DataState } from '../types';
	import StatTile from '../StatTile/StatTile.svelte';
	import Card from '../Card/Card.svelte';
	import ChartFrame from '../ChartFrame/ChartFrame.svelte';
	import LineChart from '../charts/LineChart.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import WalletContracts from '../WalletContracts/WalletContracts.svelte';
	import { compact } from '../format';
	let {
		contracts,
		current,
		pageAddress,
		selected,
		state = 'loading',
		contractSet = 'ready',
		asOf,
		onrefresh,
		now = Date.now()
	}: {
		contracts: ContractRow[];
		current: WalletEpoch | null;
		pageAddress: string;
		selected: SelectedAccount;
		state?: DataState;
		contractSet?: 'ready' | 'unavailable';
		asOf?: string;
		onrefresh?: () => void | Promise<void>;
		now?: number;
	} = $props();
	const failed = $derived(contractSet === 'unavailable' || state === 'error');
	const totals = $derived(summarizeContracts(contracts));
	const timeline = $derived(buildVestingTimeline(contracts, now));
	const amount = (n: number | null) =>
		n === null ? 'Unavailable' : n > 0 && n < 0.01 ? '<0.01' : compact(n, 2);
	const empty = $derived(!failed && state !== 'loading' && contracts.length === 0);
	const tileState = $derived(
		state === 'loading' ? 'loading' : state === 'stale' ? 'stale' : 'ready'
	);
	const data = $derived({
		columns: [
			'Month ending (UTC)',
			'Exact unlock dates, contracts and amounts',
			'Scheduled VOI',
			'Cumulative scheduled VOI'
		],
		rows: timeline.months.map((month, index) => [
			month.date,
			index === 0
				? 'Schedule starts'
				: timeline.events
						.filter((e) => e.date.slice(0, 7) === month.date.slice(0, 7))
						.map((e) => `${e.date} #${e.contractId}: ${e.amount} VOI`)
						.join('; '),
			month.amount,
			month.cumulative
		]),
		caption: 'Contract schedule; not a guarantee of withdrawable balance.'
	});
	const points = $derived(
		timeline.months.map((month) => ({ x: new Date(month.date), y: month.cumulative }))
	);
	const end = $derived(points.at(-1)?.x ?? new Date(now + 86400000));
</script>

<div class="grid min-w-0 grid-cols-1 gap-bento md:grid-cols-2 lg:grid-cols-12">
	<div class="min-w-0 lg:col-span-4">
		<StatTile
			label="Contracts"
			value={failed ? 'Unavailable' : String(totals.count)}
			detail={empty ? 'No lock contracts' : undefined}
			state={tileState}
			{asOf}
		/>
	</div>
	<div class="min-w-0 lg:col-span-4">
		<StatTile
			label="Locked VOI"
			value={failed ? 'Unavailable' : empty ? 'No lock contracts' : amount(totals.locked)}
			unit={!failed && !empty && totals.locked !== null ? 'VOI' : undefined}
			detail={totals.locked === null && !failed ? 'Totals are incomplete' : undefined}
			state={tileState}
			{asOf}
		/>
	</div>
	<div class="min-w-0 md:col-span-2 lg:col-span-4">
		<StatTile
			label="Withdrawable now"
			value={failed ? 'Unavailable' : empty ? 'No lock contracts' : amount(totals.available)}
			unit={!failed && !empty && totals.available !== null ? 'VOI' : undefined}
			detail={totals.available === null && !failed ? 'Totals are incomplete' : undefined}
			state={tileState}
			{asOf}
		/>
	</div>
	<div class="min-w-0 md:col-span-2 lg:col-span-12">
		{#if state === 'loading' || (!failed && timeline.complete && timeline.events.length > 0)}
			<ChartFrame
				title="Scheduled unlocks"
				summary="Cumulative scheduled contract releases in VOI, grouped by UTC month"
				{data}
				{state}
				{asOf}
				onretry={onrefresh}
				height={240}
				x={{ kind: 'time', domain: [new Date(now), end] }}
				y={{
					domain: [0, Math.max(1, timeline.months.at(-1)?.cumulative ?? 0)],
					format: (n) => compact(n, 1)
				}}
			>
				{#snippet children(ctx)}<LineChart
						{ctx}
						{points}
						area={false}
						labelLatest={false}
					/>{/snippet}
			</ChartFrame>
		{:else}
			<Card title="Scheduled unlocks">
				<p class="mb-3 text-sm text-ink-muted">
					Contract schedule; not a guarantee of withdrawable balance.
				</p>
				{#if failed}<InlineAlert message="Lock contracts unavailable." onretry={onrefresh} />
				{:else if !timeline.complete}<InlineAlert
						tone="warn"
						message={`Schedule unavailable for ${timeline.unavailable.map((id) => `contract #${id}`).join(', ')}; the schedule is incomplete.`}
						onretry={onrefresh}
					/>
				{:else}<p class="flex h-60 items-center justify-center text-sm text-ink-muted">
						No scheduled unlocks
					</p>{/if}
			</Card>
		{/if}
	</div>
	<div class="min-w-0 md:col-span-2 lg:col-span-12">
		<WalletContracts
			mode="full"
			{contracts}
			{current}
			{pageAddress}
			{selected}
			state={failed && state !== 'stale' ? 'error' : state}
			{contractSet}
			{asOf}
			{onrefresh}
		/>
	</div>
</div>
