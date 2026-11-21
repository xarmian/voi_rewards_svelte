<script lang="ts">
	import Card from '$lib/ds/Card/Card.svelte';
	import Button from '$lib/ds/Button/Button.svelte';
	import DataTable from '$lib/ds/DataTable/DataTable.svelte';
	import StatusPill from '$lib/ds/StatusPill/StatusPill.svelte';
	import InlineAlert from '$lib/ds/InlineAlert/InlineAlert.svelte';
	import { comma, compact, pct, shortAddr } from '$lib/ds/format';
	import { retryKeepingFocus } from '$lib/ds/retryFocus';
	import type { Column } from '$lib/ds/DataTable/types';
	import type { Source } from '$lib/wallet/read';
	import type { RewardAccount } from '$lib/wallet/rewards';
	import { epochRange } from '../calendar';
	import {
		mergeRewardRows,
		missingEpochsMessage,
		type EpochRewardsState,
		type RewardRow
	} from './rewards';

	// The wallet Rewards tab's "Rewards by epoch" card, moved here unchanged.
	type Key = keyof EpochRewardsState | 'account';
	let {
		epoch,
		account,
		pageAddress,
		at,
		retry,
		onrefresh
	}: {
		epoch: EpochRewardsState;
		/** The tab's account balance read, shared with its daily proposals. */
		account: Source<RewardAccount>;
		pageAddress: string;
		at: Date;
		retry: (source: Key) => unknown;
		/** Refreshes every reader on the tab. */
		onrefresh: () => void;
	} = $props();
	const sourceOf = (key: Key): Source<unknown> => (key === 'account' ? account : epoch[key]);
	let epochsRegion: HTMLDivElement | undefined = $state();
	let rows = $derived(
		mergeRewardRows(
			epoch.epochs.value ?? [],
			epoch.payouts,
			at.getTime(),
			account.value,
			epoch.eligible.value,
			epoch.supply.value
		)
	);
	let missingMessage = $derived(missingEpochsMessage(epoch.epochs.value ?? []));
	const SNAPSHOT_MISSING = 'Not yet available';
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
			sortValue: (row) => (row.missing ? null : row.blocks),
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
			header: 'Actual reward',
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

{#snippet warning(source: Key, message: string, region: () => HTMLElement | undefined)}
	{#if sourceOf(source).state === 'error' || sourceOf(source).error}
		<InlineAlert
			{message}
			tone={sourceOf(source).value !== undefined ? 'warn' : 'danger'}
			onretry={retryKeepingFocus(region, () => void retry(source))}
		/>
	{/if}
	{#if sourceOf(source).state === 'stale'}<p class="text-label text-warn">
			As of {new Date(sourceOf(source).asOf!).toUTCString()}{sourceOf(source).error
				? ' · Refresh failed'
				: ''}
		</p>{/if}
{/snippet}
{#snippet blocksCell(row: RewardRow)}{#if row.missing}{SNAPSHOT_MISSING}{:else}<span
			title={`${row.blocks} / ${row.expected ?? 'Unavailable'}`}
			>{comma(row.blocks)} / {row.expected === null ? 'Unavailable' : comma(row.expected, 1)}</span
		>{/if}{/snippet}
{#snippet luckCell(row: RewardRow)}{row.missing
		? SNAPSHOT_MISSING
		: row.ratio === null
			? 'Unavailable'
			: pct(row.ratio * 100)}{/snippet}
{#snippet estimateCell(row: RewardRow)}{#if row.missing}{SNAPSHOT_MISSING}{:else}<span
			title={String(row.estimate ?? 'Unavailable')}
			>{row.tooEarly ? 'Too early to project' : amount(row.estimate)}</span
		>{/if}{/snippet}
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
		{#if row.missing}<p>
				Epoch snapshot not yet available. Produced and expected blocks will appear once it is
				published.
			</p>
			<p>
				Actual: {row.actual === null ? row.payoutText : `${comma(row.actual, 2)} VOI`}
			</p>{:else}<p>
				Produced: {comma(row.blocks)} · Expected: {row.expected === null
					? 'Unavailable'
					: comma(row.expected, 2)} · Luck: {row.ratio === null
					? 'Unavailable'
					: pct(row.ratio * 100)}
			</p>
			<p title={String(row.estimate ?? 'Unavailable')}>
				Estimated reward: {row.tooEarly ? 'Too early to project' : amount(row.estimate)} · Actual: {row.actual ===
				null
					? row.payoutText
					: `${comma(row.actual, 2)} VOI`}
			</p>{/if}
		{#if row.explanation}<p>{row.explanation}</p>{/if}
		{#if row.blocks > 0 || row.missing}<p>
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

<Card title="Rewards by epoch">
	{#snippet actions()}<Button variant="soft" onclick={() => onrefresh()}>Refresh rewards</Button
		>{/snippet}
	<div bind:this={epochsRegion} tabindex="-1" class="focus:outline-none">
		<p class="mb-3 text-label text-ink-muted">
			Rewards received by {shortAddr(pageAddress)}. Open a contract to see its rewards.
		</p>
		<p class="mb-3 text-label text-ink-muted">
			Expected using current online balance; historical account stake is unavailable.
		</p>
		{@render warning('epochs', 'Reward history unavailable', () => epochsRegion)}
		{@render warning('payouts', 'Recorded epoch rewards unavailable', () => epochsRegion)}
		{@render warning('account', 'Current account balance unavailable', () => epochsRegion)}
		{@render warning('eligible', 'Historical eligible stake unavailable', () => epochsRegion)}
		{@render warning('supply', 'Current eligible stake unavailable', () => epochsRegion)}
		{#if epoch.payouts.value?.complete === false}<InlineAlert
				tone="warn"
				message="Recorded epoch rewards incomplete. Reward attribution unavailable."
				onretry={() => void retry('payouts')}
			/>{/if}
		{#if missingMessage}<InlineAlert
				tone="warn"
				message={missingMessage}
				onretry={() => void retry('epochs')}
			/>{/if}
		{#if epoch.epochs.state === 'loading'}
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
				caption={`Rewards by epoch for ${pageAddress}; estimates and actual rewards in VOI`}
				id="wallet-reward-epochs"
				density="compact"
				sort={{ key: 'epoch', dir: 'desc' }}
				limit={15}
				moreLabel={(hidden) => `See ${hidden} more epochs`}
				expandable
				{detail}
				state={epoch.epochs.state}
				asOf={epoch.epochs.asOf}
				onretry={retryKeepingFocus(
					() => epochsRegion,
					() => void retry('epochs')
				)}
				emptyText="No reward history returned for this address"
			/>
		{/if}
	</div>
</Card>
