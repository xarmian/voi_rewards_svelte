<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Card from '../Card/Card.svelte';
	import Button from '../Button/Button.svelte';
	import DataTable from '../DataTable/DataTable.svelte';
	import ChartFrame from '../ChartFrame/ChartFrame.svelte';
	import StatusPill from '../StatusPill/StatusPill.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import BarsVsExpected from '../charts/BarsVsExpected.svelte';
	import LineChart from '../charts/LineChart.svelte';
	import { comma, compact, pct, shortAddr } from '../format';
	import type { Column } from '../DataTable/types';
	import { annotationsFor } from '$lib/data/chartEvents';
	import { epochRange } from '$lib/epochs';
	import { createReadSource } from '$lib/wallet/read';
	import {
		createRewardsState,
		loadRewardEpochs,
		loadPayouts,
		loadDailyProposals,
		loadRewardAccount,
		loadEligibleStakes,
		loadDailyStake,
		loadRewardSupply,
		mergeRewardRows,
		dailyProposals,
		cumulativePayouts,
		recordedPayouts,
		type RewardRow,
		type RewardsState
	} from '$lib/wallet/rewards';
	let { pageAddress, now }: { pageAddress: string; now?: Date } = $props();
	let clock = $state(new Date());
	let at = $derived(now ?? clock);
	let sources = $state(createRewardsState());
	const readers = {
		epochs: createReadSource(loadRewardEpochs, (result) => (sources.epochs = result)),
		payouts: createReadSource(loadPayouts, (result) => (sources.payouts = result)),
		daily: createReadSource(loadDailyProposals, (result) => (sources.daily = result)),
		account: createReadSource(loadRewardAccount, (result) => (sources.account = result)),
		eligible: createReadSource(loadEligibleStakes, (result) => (sources.eligible = result)),
		dailyStake: createReadSource(loadDailyStake, (result) => (sources.dailyStake = result)),
		supply: createReadSource(loadRewardSupply, (result) => (sources.supply = result))
	};
	function retry(source: keyof RewardsState) {
		return readers[source].load(pageAddress, true);
	}
	function refresh(address = pageAddress) {
		for (const reader of Object.values(readers)) void reader.load(address, true);
	}
	$effect(() => {
		const address = pageAddress;
		untrack(() => {
			for (const reader of Object.values(readers)) void reader.load(address);
		});
		return () => {
			for (const reader of Object.values(readers)) reader.dispose();
		};
	});
	onMount(() => {
		const timer = setInterval(() => (clock = new Date()), 30000);
		return () => clearInterval(timer);
	});
	let rows = $derived(
		mergeRewardRows(
			sources.epochs.value ?? [],
			sources.payouts,
			at.getTime(),
			sources.account.value,
			sources.eligible.value,
			sources.supply.value
		)
	);
	let days = $derived(
		dailyProposals(
			sources.daily.value ?? {},
			sources.account.value ? sources.account.value.balance * 1e6 : null,
			sources.dailyStake.value ?? [],
			at
		)
	);
	let expectedMissing = $derived(
		!sources.account.value ||
			!sources.dailyStake.value ||
			days.some((day) => day.actual !== null && day.expected === null)
	);
	let recorded = $derived(sources.payouts.value ? recordedPayouts(sources.payouts.value) : []);
	let cumulative = $derived(sources.payouts.value ? cumulativePayouts(sources.payouts.value) : []);
	let dailyData = $derived({
		columns: ['UTC date', 'Produced blocks', 'Expected approximation', 'State'],
		rows: days.map((day) => [
			day.date,
			day.actual ?? 'Unavailable',
			day.expected ?? 'Unavailable',
			day.current ? 'In progress' : 'Complete'
		]),
		caption:
			'Proposals API; expected = current account balance / daily average online stake × (86400 / 2.8). Omitted dates are unavailable, not zero.'
	});
	let payoutData = $derived({
		columns: ['UTC receipt', 'Transaction ID', 'Amount VOI', 'Running VOI'],
		rows: recorded.map((payment) => [
			payment.timestamp,
			payment.txid,
			payment.amount,
			payment.running
		]),
		caption:
			sources.payouts.value?.complete === false
				? 'Known recorded payments subtotal; incomplete. Line withheld until Retry succeeds.'
				: 'Cumulative recorded payments; missing or unreturned payments are not included. Source: get_account_transactions_multi.'
	});
	let dailyMax = $derived(
		Math.max(1, ...days.flatMap((day) => [day.actual ?? 0, day.expected ?? 0])) * 1.2
	);
	let payoutMax = $derived(Math.max(1, ...cumulative.map((payment) => payment.running)) * 1.1);
	function amount(value: number | null) {
		return value === null
			? 'Unavailable'
			: value > 0 && value < 0.01
				? '<0.01 VOI'
				: `${compact(value, 2)} VOI`;
	}
	let columns: Column<RewardRow>[] = $derived([
		{
			key: 'epoch',
			header: 'Epoch',
			priority: 1,
			numeric: true,
			sortable: true,
			sortValue: (row) => row.epoch
		},
		{
			key: 'blocks',
			header: 'Blocks / Expected',
			priority: 2,
			numeric: true,
			sortable: true,
			sortValue: (row) => row.blocks,
			cell: blocksCell
		},
		{
			key: 'ratio',
			header: 'Luck',
			priority: 3,
			numeric: true,
			sortable: true,
			sortValue: (row) => row.ratio,
			cell: luckCell
		},
		{
			key: 'estimate',
			header: 'Est. reward',
			priority: 2,
			numeric: true,
			sortable: true,
			sortValue: (row) => row.estimate,
			cell: estimateCell
		},
		{
			key: 'actual',
			header: 'Actual payout',
			priority: 1,
			numeric: true,
			sortable: true,
			sortValue: (row) => row.actual,
			cell: payoutCell
		},
		{
			key: 'status',
			header: 'Status',
			priority: 1,
			sortable: true,
			sortValue: (row) => row.status,
			cell: statusCell
		}
	]);
</script>

{#snippet warning(source: keyof RewardsState, message: string)}
	{#if sources[source].state === 'error' || sources[source].error}
		<InlineAlert
			{message}
			tone={sources[source].value !== undefined ? 'warn' : 'danger'}
			onretry={() => void retry(source)}
		/>
	{/if}
	{#if sources[source].state === 'stale'}<p class="text-label text-warn">
			As of {new Date(sources[source].asOf!).toUTCString()}{sources[source].error
				? ' · Refresh failed'
				: ''}
		</p>{/if}
{/snippet}
{#snippet blocksCell(row: RewardRow)}<span
		title={`${row.blocks} / ${row.expected ?? 'Unavailable'}`}
		>{comma(row.blocks)} / {row.expected === null ? 'Unavailable' : comma(row.expected, 1)}</span
	>{/snippet}
{#snippet luckCell(row: RewardRow)}{row.ratio === null
		? 'Unavailable'
		: pct(row.ratio * 100)}{/snippet}
{#snippet estimateCell(row: RewardRow)}<span title={String(row.estimate ?? 'Unavailable')}
		>{row.tooEarly ? 'Too early to project' : amount(row.estimate)}</span
	>{/snippet}
{#snippet payoutCell(row: RewardRow)}
	<span
		class="break-words"
		title={row.actual === null ? row.explanation || row.payoutText : `${row.actual} VOI`}
		>{row.actual === null ? row.payoutText : amount(row.actual)}</span
	>
{/snippet}
{#snippet statusCell(row: RewardRow)}{#if row.status}<StatusPill
			tone={row.tone}
			label={row.status}
		/>{:else}<span class="text-ink-muted">—</span>{/if}{/snippet}
{#snippet detail(row: RewardRow)}
	<div class="space-y-2 break-words text-label">
		<p>{epochRange(row.epoch).label} (UTC)</p>
		<p>
			Produced: {comma(row.blocks)} · Expected: {row.expected === null
				? 'Unavailable'
				: comma(row.expected, 2)} · Luck: {row.ratio === null
				? 'Unavailable'
				: pct(row.ratio * 100)}
		</p>
		<p title={String(row.estimate ?? 'Unavailable')}>
			Estimated reward: {row.tooEarly ? 'Too early to project' : amount(row.estimate)} · Payout: {row.actual ===
			null
				? row.payoutText
				: `${comma(row.actual, 2)} VOI`}
		</p>
		{#if row.explanation}<p>{row.explanation}</p>{/if}
		{#if row.blocks > 0}<p>
				Matched by receipt date in the following week: {epochRange(
					row.epoch + 1
				).start.toISOString()} inclusive to {epochRange(row.epoch + 2).start.toISOString()} exclusive.
			</p>{/if}
		{#each row.payments as payment (payment.txid)}
			<a
				class="block break-all text-accent underline"
				href={`https://block.voi.network/explorer/transaction/${encodeURIComponent(payment.txid)}`}
				target="_blank"
				rel="noopener noreferrer"
				>{payment.txid} · {payment.amount} VOI<span class="sr-only"> (opens in a new tab)</span></a
			>
		{/each}
	</div>
{/snippet}

<div class="min-w-0 space-y-5 [overflow-wrap:anywhere]">
	<Card title="Rewards by epoch">
		{#snippet actions()}<Button variant="soft" onclick={() => refresh()}>Refresh rewards</Button
			>{/snippet}
		<p class="mb-3 text-label text-ink-muted">
			Rewards received by {shortAddr(pageAddress)}. Open a contract to see its rewards.
		</p>
		<p class="mb-3 text-label text-ink-muted">
			Expected using current online balance; historical account stake is unavailable.
		</p>
		{@render warning('epochs', 'Reward history unavailable')}
		{@render warning('payouts', 'Recorded payouts unavailable')}
		{@render warning('account', 'Current account balance unavailable')}
		{@render warning('eligible', 'Historical eligible stake unavailable')}
		{@render warning('supply', 'Current eligible stake unavailable')}
		{#if sources.payouts.value?.complete === false}<InlineAlert
				tone="warn"
				message="Recorded payouts incomplete. Payout attribution unavailable."
				onretry={() => void retry('payouts')}
			/>{/if}
		{#if sources.epochs.state === 'loading'}
			<div aria-busy="true" class="space-y-3">
				<p class="sr-only">Loading rewards by epoch…</p>
				{#each Array.from({ length: 8 }, (_, index) => index) as index (index)}<div
						class="h-9 rounded-ds-xs bg-grid"
					></div>{/each}
			</div>
		{:else}
			<DataTable
				{columns}
				{rows}
				rowKey={(row) => String(row.epoch)}
				rowName={(row) => `epoch ${row.epoch}`}
				caption={`Rewards by epoch for ${pageAddress}; estimates and payouts in VOI`}
				id="wallet-reward-epochs"
				density="compact"
				sort={{ key: 'epoch', dir: 'desc' }}
				limit={15}
				moreLabel={(hidden) => `See ${hidden} more epochs`}
				expandable
				{detail}
				state={sources.epochs.state}
				asOf={sources.epochs.asOf}
				onretry={() => void retry('epochs')}
				emptyText="No reward history returned for this address"
			/>
		{/if}
	</Card>
	<div class="grid min-w-0 gap-bento lg:grid-cols-12">
		<div class="min-w-0 space-y-3 lg:col-span-8">
			{@render warning('daily', 'Daily proposals unavailable')}
			{@render warning('dailyStake', 'Expected proposals unavailable')}
			{#if expectedMissing && sources.dailyStake.state !== 'error'}<InlineAlert
					tone="warn"
					message="Expected proposals unavailable. Actual blocks remain visible."
					onretry={() => {
						if (!sources.account.value) void retry('account');
						void retry('dailyStake');
					}}
				/>{/if}
			{#if sources.daily.value && Object.keys(sources.daily.value).length === 0}<p
					class="text-label text-ink-muted"
				>
					No proposals returned in the last 30 days
				</p>{/if}
			<ChartFrame
				title="Daily proposals · last 30 days"
				summary="Daily produced blocks and expected approximation for this address, UTC"
				data={dailyData}
				state={sources.daily.state === 'ready' && Object.keys(sources.daily.value).length === 0
					? 'empty'
					: sources.daily.state}
				onretry={() => void retry('daily')}
				asOf={sources.daily.asOf}
				x={{ kind: 'band', values: days.map((day) => day.date) }}
				y={{ domain: [0, dailyMax] }}
				legend={days.some((day) => day.expected !== null)
					? [
							{ label: 'Produced blocks', swatch: 'fill' },
							{ label: 'Expected approximation', swatch: 'expected' },
							{ label: 'Above expected', swatch: 'hi' }
						]
					: [{ label: 'Produced blocks', swatch: 'fill' }]}
				annotations={annotationsFor('blocksVsExpected', 'date')}
				describe={(index) => dailyData.rows[index].join(' · ')}
				height={240}
			>
				{#snippet children(ctx)}<BarsVsExpected
						{ctx}
						bars={days.map((day) => ({
							x: day.date,
							value: day.actual ?? NaN,
							expected: day.expected ?? NaN
						}))}
					/>{/snippet}
			</ChartFrame>
		</div>
		<div class="min-w-0 space-y-3 lg:col-span-4">
			{#if sources.payouts.value?.complete && !recorded.length}<p class="text-label text-ink-muted">
					No recorded payouts returned.
				</p>{/if}
			<ChartFrame
				title="Recorded payouts"
				summary="Cumulative recorded VOI payments, matched rewards senders and this recipient"
				data={payoutData}
				state={sources.payouts.value?.complete === false
					? 'error'
					: sources.payouts.value && !recorded.length
						? 'empty'
						: sources.payouts.state}
				onretry={() => void retry('payouts')}
				asOf={sources.payouts.asOf}
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
	</div>
</div>
