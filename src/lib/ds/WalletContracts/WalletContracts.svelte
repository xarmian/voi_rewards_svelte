<script lang="ts">
	import type { ContractDetails } from '$lib/types';
	import type { WalletEpoch } from '$lib/wallet/summary';
	import { summarizeContracts, type ContractRow } from '$lib/wallet/contracts';
	import { type PageAccountState } from '$lib/chain/signerGate';
	import type { Column } from '../DataTable';
	import type { DataState } from '../types';
	import Card from '../Card/Card.svelte';
	import DataTable from '../DataTable/DataTable.svelte';
	import StatusPill from '../StatusPill/StatusPill.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import Button from '../Button/Button.svelte';
	import CopyButton from '../CopyButton/CopyButton.svelte';
	import type { SortState } from '../DataTable';
	import { comma, compact, shortAddr } from '../format';

	let {
		contracts,
		current,
		pageAddress,
		accountState,
		state: dataState = 'loading',
		asOf,
		onrefresh,
		mode = 'overview',
		contractSet = 'ready'
	}: {
		mode?: 'overview' | 'full';
		contractSet?: 'ready' | 'unavailable';
		contracts: ContractRow[];
		current: WalletEpoch | null;
		pageAddress: string;
		accountState: PageAccountState<{ address: string; app: string; walletId?: string }>;
		state?: DataState;
		asOf?: string;
		onrefresh?: () => Promise<void> | void;
	} = $props();
	const sorted = $derived(
		contracts
			.slice()
			.sort(
				(a, b) =>
					Number(b.isParticipating) - Number(a.isParticipating) ||
					(b.balance ?? -1) - (a.balance ?? -1)
			)
	);
	const limit = $derived(
		Math.max(7, contracts.filter((contract) => contract.isParticipating).length)
	);
	const hiddenBalance = $derived(
		sorted.slice(limit).reduce((total, contract) => total + (contract.balance ?? 0), 0)
	);
	// Page authorization is separate from the readable, authorized population of each row.
	const canAct = $derived(
		dataState !== 'loading' &&
			dataState !== 'error' &&
			contracts.length > 0 &&
			accountState.state === 'yours'
	);
	function rowCanAct(row: ContractRow) {
		return (
			canAct &&
			contractSet === 'ready' &&
			row.details !== null &&
			accountState.state === 'yours' &&
			row.details.owner === pageAddress
		);
	}
	const hasActions = $derived(contracts.some((row) => rowCanAct(row)));
	const unavailable = $derived(contracts.filter((row) => !row.details).length);
	const available = $derived(
		contractSet === 'ready' ? summarizeContracts(contracts).available : null
	);
	let sort = $state<SortState>();
	let openContextGeneration = 0;
	$effect.pre(() => {
		void contracts;
		void accountState;
		void pageAddress;
		void dataState;
		void contractSet;
		openContextGeneration++;
	});
	let selectedContract: ContractDetails | null = $state.raw(null);
	let showWithdrawModal = $state(false);
	let showRegisterVoteKey = $state(false);
	let withdrawOpenGeneration = 0;
	let actionError = $state('');
	let WithdrawModal: typeof import('$lib/component/WithdrawModal.svelte').default | null =
		$state(null);
	let RegisterVoteKey: typeof import('$lib/component/RegisterVoteKey.svelte').default | null =
		$state(null);

	async function open(row: ContractRow, action: 'withdraw' | 'key') {
		if (!rowCanAct(row) || !row.details) return;
		const details = row.details;
		const generation = openContextGeneration;
		const population = contracts;
		const address = pageAddress;
		const membership = accountState;
		actionError = '';
		try {
			if (action === 'withdraw')
				WithdrawModal ??= (await import('$lib/component/WithdrawModal.svelte')).default;
			else RegisterVoteKey ??= (await import('$lib/component/RegisterVoteKey.svelte')).default;
			// Recheck the same captured details after import; a reload cannot redirect the opener.
			if (
				!rowCanAct(row) ||
				generation !== openContextGeneration ||
				accountState !== membership ||
				pageAddress !== address ||
				contracts !== population ||
				!contracts.includes(row) ||
				row.details !== details ||
				details.owner !== pageAddress ||
				accountState.state !== 'yours'
			)
				return;
			selectedContract = details;
			if (action === 'withdraw') {
				withdrawOpenGeneration++;
				showWithdrawModal = true;
			} else showRegisterVoteKey = true;
		} catch {
			actionError = 'Unable to open this action. Please try again.';
		}
	}
	async function handleWithdrawSuccess(forceRefresh = false) {
		const generation = withdrawOpenGeneration;
		if (forceRefresh) await onrefresh?.();
		if (generation === withdrawOpenGeneration) selectedContract = null;
	}
	async function handleVoteKeySuccess(forceRefresh = false) {
		// The modal stays open so the person sees its confirmation; closing it clears the selection.
		if (forceRefresh) await onrefresh?.();
	}
	function handleVoteKeyVisibility(show: boolean) {
		showRegisterVoteKey = show;
		if (!show) selectedContract = null;
	}
	const overviewColumns: Column<ContractRow>[] = [
		{ key: 'contract', header: 'Contract', priority: 1, cell: addressCell },
		{ key: 'status', header: 'Status', priority: 1, cell: statusCell },
		{ key: 'balance', header: 'Balance', priority: 1, numeric: true, cell: balanceCell },
		{ key: 'blocks', header: 'Blocks this epoch', priority: 3, numeric: true, cell: blocksCell },
		{ key: 'key', header: 'Key expires', priority: 3, cell: keyCell },
		{ key: 'next', header: 'Next unlock', priority: 3, cell: unlockCell }
	];
	const fullColumns: Column<ContractRow>[] = [
		{
			key: 'contract',
			header: 'Contract',
			priority: 1,
			sortable: true,
			sortValue: (r) => r.contractId,
			cell: addressCell
		},
		{
			key: 'status',
			header: 'Status',
			priority: 1,
			sortable: true,
			sortValue: (r) => (r.isParticipating === null ? null : r.isParticipating ? 0 : 1),
			cell: statusCell
		},
		{
			key: 'balance',
			header: 'Balance',
			priority: 1,
			numeric: true,
			sortable: true,
			sortValue: (r) => r.balance,
			cell: balanceCell
		},
		{
			key: 'locked',
			header: 'Locked',
			priority: 2,
			numeric: true,
			sortable: true,
			sortValue: (r) =>
				r.details?.lockedBalance == null || r.balance === null
					? null
					: Math.min(r.balance, r.details.lockedBalance / 1e6),
			cell: lockedCell
		},
		{
			key: 'available',
			header: 'Withdrawable',
			priority: 2,
			numeric: true,
			sortable: true,
			sortValue: (r) => (r.details ? r.details.availableForWithdrawal / 1e6 : null),
			cell: availableCell
		},
		{
			key: 'next',
			header: 'Next unlock',
			priority: 3,
			sortable: true,
			sortValue: (r) => r.details?.nextVestingDate?.getTime() ?? null,
			cell: unlockCell
		},
		{
			key: 'key',
			header: 'Key expires',
			priority: 3,
			sortable: true,
			sortValue: (r) =>
				r.voteLastValid === null || r.round === null
					? null
					: ((r.voteLastValid - r.round) * 2.8) / 86400,
			cell: keyCell
		}
	];
	const columns = $derived(mode === 'full' ? fullColumns : overviewColumns);
	const amount = (value: number | null) =>
		value === null || !Number.isFinite(value)
			? 'Unavailable'
			: value > 0 && value < 0.01
				? '<0.01'
				: compact(value, 2);
	const date = (value: Date) =>
		Number.isFinite(value.getTime())
			? new Intl.DateTimeFormat('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric',
					timeZone: 'UTC'
				}).format(value)
			: 'Unavailable';
</script>

{#snippet addressCell(row: ContractRow)}
	<a
		class="font-bold text-accent underline"
		href={`/wallet/${row.address}`}
		title={row.address}
		aria-label={`Contract #${row.contractId}, ${shortAddr(row.address)}`}>#{row.contractId}</a
	>
{/snippet}
{#snippet statusCell(row: ContractRow)}
	<StatusPill
		tone={row.isParticipating ? 'ok' : 'neutral'}
		label={row.isParticipating === null
			? 'Unavailable'
			: row.isParticipating
				? 'Online'
				: 'Not staking'}
	/>
{/snippet}
{#snippet balanceCell(row: ContractRow)}<span
		title={row.balance === null ? undefined : `${row.balance} VOI`}>{amount(row.balance)}</span
	>{/snippet}
{#snippet blocksCell(row: ContractRow)}{comma(
		current ? (current.blocks[row.address] ?? 0) : null
	)}{/snippet}
{#snippet keyCell(row: ContractRow)}
	{#if row.voteLastValid !== null && row.round !== null}
		{@const days = ((row.voteLastValid - row.round) * 2.8) / 86400}
		<StatusPill
			tone={days < 7 ? 'danger' : days < 30 ? 'warn' : 'ok'}
			label={days <= 0 ? 'Key expired' : `${comma(Math.ceil(days))} d remaining`}
		/>
	{:else}{row.details ? 'No key' : 'Key expiry unavailable'}{/if}
{/snippet}
{#snippet unlockCell(row: ContractRow)}
	{#if !row.details || (row.details.nextVestingDate && !Number.isFinite(row.details.nextVestingDate.getTime()))}Unavailable{:else if row.details.nextVestingDate}
		<time datetime={row.details.nextVestingDate.toISOString()}
			>{date(row.details.nextVestingDate)}</time
		>
		<span class="text-accent" title={`${row.details.nextVestingAmount / 1e6} VOI`}
			>+{amount(row.details.nextVestingAmount / 1e6)} VOI</span
		>
	{:else}{row.details.isFullyVested ? 'Fully vested' : 'No scheduled unlock'}{/if}
{/snippet}
{#snippet lockedCell(row: ContractRow)}<span
		title={row.details ? `${row.details.lockedBalance / 1e6} VOI` : undefined}
		>{amount(
			row.details && row.balance !== null
				? Math.min(row.balance, row.details.lockedBalance / 1e6)
				: null
		)}</span
	>{/snippet}
{#snippet availableCell(row: ContractRow)}<span
		title={row.details ? `${row.details.availableForWithdrawal / 1e6} VOI` : undefined}
		>{amount(row.details ? row.details.availableForWithdrawal / 1e6 : null)}</span
	>{/snippet}
{#snippet actions(row: ContractRow)}
	<button type="button" role="menuitem" onclick={() => open(row, 'withdraw')}>Withdraw</button>
	<button type="button" role="menuitem" onclick={() => open(row, 'key')}
		>{row.isParticipating ? 'Update' : 'Register'} participation key</button
	>
{/snippet}

{#snippet detail(row: ContractRow)}
	<div class="min-w-0 space-y-3">
		<dl class="grid min-w-0 grid-cols-1 gap-3 break-words text-sm md:grid-cols-2">
			<div>
				<dt class="text-ink-muted">Contract address</dt>
				<dd class="break-all">
					{row.address}
					<CopyButton text={row.address} what="contract address" />
				</dd>
			</div>
			<div>
				<dt class="text-ink-muted">Owner address</dt>
				<dd class="break-all">
					{#if row.details}{row.details.owner}
						<CopyButton text={row.details.owner} what="owner address" />{:else}Unavailable{/if}
				</dd>
			</div>
			<div>
				<dt class="text-ink-muted">Blocks this epoch</dt>
				<dd>{@render blocksCell(row)}</dd>
			</div>
			<div>
				<dt class="text-ink-muted">Funding date</dt>
				<dd>
					{row.details?.fundingTime
						? date(new Date(row.details.fundingTime * 1000))
						: 'Unavailable'}
				</dd>
			</div>
			<div>
				<dt class="text-ink-muted">Lockup term</dt>
				<dd>{row.details ? `${comma(row.details.lockupPeriod)} seconds` : 'Unavailable'}</dd>
			</div>
			<div>
				<dt class="text-ink-muted">Vesting term</dt>
				<dd>
					{row.details
						? `${comma(row.details.distributionCount)} releases, every ${comma(row.details.distributionSeconds)} seconds`
						: 'Unavailable'}
				</dd>
			</div>
			<div>
				<dt class="text-ink-muted">Contract amount</dt>
				<dd title={row.details ? `${Number(row.details.totalAmount) / 1e6} VOI` : undefined}>
					{row.details ? `${comma(Number(row.details.totalAmount) / 1e6, 2)} VOI` : 'Unavailable'}
				</dd>
			</div>
		</dl>
		{#if rowCanAct(row)}<div class="flex flex-wrap gap-2">
				<Button variant="primary" onclick={() => open(row, 'withdraw')}>Withdraw</Button>
				<Button variant="soft" onclick={() => open(row, 'key')}
					>{row.isParticipating ? 'Update' : 'Register'} participation key</Button
				>
			</div>{/if}
	</div>
{/snippet}

<Card title="Lock contracts">
	<p class="mb-3 text-label text-ink-muted">
		{dataState === 'loading'
			? 'Loading withdrawable balance…'
			: dataState === 'error' || available === null
				? 'Withdrawable balance unavailable'
				: `${amount(available)} VOI withdrawable now`}
	</p>
	{#if unavailable > 0 && dataState !== 'loading' && dataState !== 'error'}
		<div class="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
			<p>
				{unavailable} of {contracts.length} contracts could not be loaded; totals are incomplete.
			</p>
			<Button variant="soft" size="sm" onclick={onrefresh}>Refresh</Button>
		</div>
	{/if}
	{#if mode === 'full' && dataState === 'loading'}
		<div aria-busy="true" class="space-y-2">
			<span class="sr-only">Loading lock contracts…</span>
			{#each [0, 1, 2, 3, 4, 5, 6] as index (index)}<div
					data-contract-skeleton
					aria-hidden="true"
					class="h-8 rounded-ds-xs bg-grid"
				></div>{/each}
		</div>
	{:else}
		<DataTable
			{columns}
			rows={sorted}
			rowKey={(row) => String(row.contractId)}
			rowName={(row) => `contract #${row.contractId}`}
			caption="Lock contracts: balances in VOI"
			captionHidden
			density="compact"
			state={dataState}
			{asOf}
			onretry={onrefresh}
			limit={mode === 'full' ? undefined : limit}
			bind:sort
			detail={mode === 'full' ? detail : undefined}
			moreLabel={(hidden) =>
				`Show ${hidden} more not-staking contracts (${compact(hiddenBalance, 1)} VOI)`}
			rowActions={mode === 'overview' && hasActions ? actions : undefined}
			rowHasActions={rowCanAct}
			expandable={mode === 'full' || !hasActions}
			emptyText="No lock contracts for this account."
		/>
	{/if}
	{#if actionError}<InlineAlert message={actionError} />{/if}
</Card>

{#if selectedContract && showWithdrawModal && WithdrawModal}
	<WithdrawModal
		{pageAddress}
		contract={selectedContract}
		bind:show={showWithdrawModal}
		onSuccess={handleWithdrawSuccess}
	/>
{/if}
{#if selectedContract && showRegisterVoteKey && RegisterVoteKey}
	<RegisterVoteKey
		{pageAddress}
		walletAddress={selectedContract.contractAddress}
		parentWalletAddress={selectedContract.owner}
		contractId={selectedContract.contractId}
		isOnline={selectedContract.isParticipating}
		bind:showModal={() => showRegisterVoteKey, handleVoteKeyVisibility}
		onSuccess={handleVoteKeySuccess}
	/>
{/if}
