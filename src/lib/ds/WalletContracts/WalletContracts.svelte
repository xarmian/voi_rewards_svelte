<script lang="ts">
	import type { ContractDetails } from '$lib/types';
	import type { WalletContract, WalletEpoch } from '$lib/wallet/summary';
	import { canSignFor, type SelectedAccount } from '$lib/chain/signerGate';
	import type { Column } from '../DataTable';
	import type { DataState } from '../types';
	import Card from '../Card/Card.svelte';
	import DataTable from '../DataTable/DataTable.svelte';
	import StatusPill from '../StatusPill/StatusPill.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import { comma, compact, shortAddr } from '../format';

	let {
		contracts,
		current,
		pageAddress,
		selected,
		state: dataState = 'loading',
		asOf,
		onrefresh
	}: {
		contracts: WalletContract[];
		current: WalletEpoch | null;
		pageAddress: string;
		selected: SelectedAccount;
		state?: DataState;
		asOf?: string;
		onrefresh?: () => Promise<void> | void;
	} = $props();
	const sorted = $derived(
		contracts
			.slice()
			.sort(
				(a, b) => Number(b.isParticipating) - Number(a.isParticipating) || b.balance - a.balance
			)
	);
	const limit = $derived(
		Math.max(7, contracts.filter((contract) => contract.isParticipating).length)
	);
	const hiddenBalance = $derived(
		sorted.slice(limit).reduce((total, contract) => total + contract.balance, 0)
	);
	// DataTable owns one row-actions column. Suppress that column entirely for watch-only,
	// another page, or incomplete ownership data; no empty or disabled signing menus.
	const canAct = $derived(
		dataState !== 'loading' &&
			dataState !== 'error' &&
			contracts.length > 0 &&
			selected?.address === pageAddress &&
			contracts.every(
				(contract) => contract.details !== null && canSignFor(selected, contract.details.owner)
			)
	);
	const available = $derived(
		contracts.every((contract) => contract.details)
			? contracts.reduce((sum, contract) => sum + contract.details!.availableForWithdrawal / 1e6, 0)
			: null
	);
	let selectedContract: ContractDetails | null = $state(null);
	let showWithdrawModal = $state(false);
	let showRegisterVoteKey = $state(false);
	let withdrawOpenGeneration = 0;
	let actionError = $state('');
	let WithdrawModal: typeof import('$lib/component/WithdrawModal.svelte').default | null =
		$state(null);
	let RegisterVoteKey: typeof import('$lib/component/RegisterVoteKey.svelte').default | null =
		$state(null);

	async function open(row: WalletContract, action: 'withdraw' | 'key') {
		if (!canAct || !row.details) return;
		actionError = '';
		try {
			if (action === 'withdraw')
				WithdrawModal ??= (await import('$lib/component/WithdrawModal.svelte')).default;
			else RegisterVoteKey ??= (await import('$lib/component/RegisterVoteKey.svelte')).default;
			// The page or picker may have moved while the component was loading.
			if (!canAct || !canSignFor(selected, row.details.owner) || selected?.address !== pageAddress)
				return;
			selectedContract = row.details;
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
		if (forceRefresh) await onrefresh?.();
		selectedContract = null;
		showRegisterVoteKey = false;
	}
	const columns: Column<WalletContract>[] = [
		{ key: 'contract', header: 'Contract', priority: 1, cell: addressCell },
		{ key: 'status', header: 'Status', priority: 1, cell: statusCell },
		{ key: 'balance', header: 'Balance', priority: 1, numeric: true, cell: balanceCell },
		{ key: 'blocks', header: 'Blocks this epoch', priority: 3, numeric: true, cell: blocksCell },
		{ key: 'key', header: 'Key expires', priority: 3, cell: keyCell },
		{ key: 'next', header: 'Next unlock', priority: 3, cell: unlockCell }
	];
	const date = (value: Date) =>
		new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(value);
</script>

{#snippet addressCell(row: WalletContract)}
	<a
		class="font-bold text-accent underline"
		href={`/wallet/${row.address}`}
		title={row.address}
		aria-label={`Contract #${row.contractId}, ${shortAddr(row.address)}`}>#{row.contractId}</a
	>
{/snippet}
{#snippet statusCell(row: WalletContract)}
	<StatusPill
		tone={row.isParticipating ? 'ok' : 'neutral'}
		label={row.isParticipating ? 'Online' : 'Not staking'}
	/>
{/snippet}
{#snippet balanceCell(row: WalletContract)}<span title={`${row.balance} VOI`}
		>{compact(row.balance, 1)}</span
	>{/snippet}
{#snippet blocksCell(row: WalletContract)}{comma(
		current ? (current.blocks[row.address] ?? 0) : null
	)}{/snippet}
{#snippet keyCell(row: WalletContract)}
	{#if row.voteLastValid !== null}
		{@const days = ((row.voteLastValid - row.round) * 2.8) / 86400}
		<StatusPill
			tone={days < 7 ? 'danger' : days < 30 ? 'warn' : 'ok'}
			label={days <= 0 ? 'Key expired' : `${comma(Math.ceil(days))} d remaining`}
		/>
	{:else}No key{/if}
{/snippet}
{#snippet unlockCell(row: WalletContract)}
	{#if !row.details}Unavailable{:else if row.details.nextVestingDate}
		<time datetime={row.details.nextVestingDate.toISOString()}
			>{date(row.details.nextVestingDate)}</time
		>
		<span class="text-accent">+{compact(row.details.nextVestingAmount / 1e6, 1)} VOI</span>
	{:else}{row.details.isFullyVested ? 'Fully vested' : 'No scheduled unlock'}{/if}
{/snippet}
{#snippet actions(row: WalletContract)}
	<button type="button" role="menuitem" onclick={() => open(row, 'withdraw')}>Withdraw</button>
	<button type="button" role="menuitem" onclick={() => open(row, 'key')}
		>{row.isParticipating ? 'Update' : 'Register'} participation key</button
	>
{/snippet}

<Card title="Lock contracts">
	<p class="mb-3 text-label text-ink-muted">
		{dataState === 'loading'
			? 'Loading withdrawable balance…'
			: dataState === 'error' || available === null
				? 'Withdrawable balance unavailable'
				: `${compact(available, 1)} VOI withdrawable now`}
	</p>
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
		{limit}
		moreLabel={(hidden) =>
			`Show ${hidden} more not-staking contracts (${compact(hiddenBalance, 1)} VOI)`}
		rowActions={canAct ? actions : undefined}
		expandable={!canAct}
		emptyText="No lock contracts for this account."
	/>
	{#if actionError}<InlineAlert message={actionError} />{/if}
</Card>

{#if selectedContract && showWithdrawModal && WithdrawModal}
	<WithdrawModal
		contract={selectedContract}
		bind:show={showWithdrawModal}
		onSuccess={handleWithdrawSuccess}
	/>
{/if}
{#if selectedContract && showRegisterVoteKey && RegisterVoteKey}
	<RegisterVoteKey
		walletAddress={selectedContract.contractAddress}
		parentWalletAddress={selectedContract.owner}
		contractId={selectedContract.contractId}
		isOnline={selectedContract.isParticipating}
		bind:showModal={showRegisterVoteKey}
		onSuccess={handleVoteKeySuccess}
	/>
{/if}
