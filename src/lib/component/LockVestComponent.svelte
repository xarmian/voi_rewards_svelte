<script lang="ts">
	import { browser } from '$app/environment';
	import LockContract from './LockContract.svelte';

	import { algodClient } from '$lib/utils/algod';
	import { decodeLockContractState } from '$lib/chain/lockContract';
	import WithdrawModal from './WithdrawModal.svelte';
	import RegisterVoteKey from './RegisterVoteKey.svelte';
	import { getConsensusInfo, requireAccountInfo } from '$lib/stores/accounts';
	import type { ContractDetails } from '$lib/types';
	import { selectedWallet } from 'avm-wallet-svelte';

	export let childAccounts: {
		contractId: number;
		address: string;
		isParticipating: boolean;
		balance: number;
	}[];

	let contracts: ContractDetails[] = [];
	let isLoading = true;
	let error: string | null = null;
	let selectedContract: ContractDetails | null = null;
	let showWithdrawModal = false;
	let showRegisterVoteKey = false;
	let consensusData: { [key: string]: any } = {};

	// TASK-111: a reload can start while an earlier one is in flight; only the latest may write.
	let loadSequence = 0;
	// Contracts whose reads failed: counted and shown, not dropped silently.
	let failedCount = 0;

	async function loadContractDetails() {
		const sequence = ++loadSequence;
		isLoading = true;
		error = null;

		try {
			// Create a new array to hold all contract promises
			const contractPromises = childAccounts.map(async (account) => {
				try {
					// Get the application info using algodClient
					const appInfo = await algodClient.getApplicationByID(account.contractId).do();
					const accountInfo = await requireAccountInfo(account.address, { force: true });
					const currentBalance = accountInfo.amount as number;

					// Decode the global state
					const decodedState = decodeLockContractState(
						appInfo.params['global-state'],
						account.address
					);

					// Calculate periods and balances
					const now = Math.floor(Date.now() / 1000);
					const fundingTime = decodedState.global_funding
						? Number(decodedState.global_funding)
						: null;

					let nextVestingDate = null;
					let lockedBalance = 0;
					let isFullyVested = false;
					let nextVestingAmount = 0;
					let remainingVestingAmount = 0;
					let availableForWithdrawal = 0;

					if (fundingTime) {
						// Calculate lockup components
						const lockupDelay =
							Number(decodedState.global_lockup_delay ?? 0) *
							Number(decodedState.global_period ?? 0) *
							Number(decodedState.global_period_seconds ?? 0);

						const vestingDelay =
							Math.max(1, Number(decodedState.global_vesting_delay ?? 0)) *
							Number(decodedState.global_period_seconds ?? 0);

						const lockupPeriod = lockupDelay;
						const fullVestingTime = lockupPeriod + vestingDelay;
						const vestingPeriod =
							Number(decodedState.global_distribution_count ?? 0) *
							Number(decodedState.global_distribution_seconds ?? 0);

						const totalPeriod = fullVestingTime + vestingPeriod;
						const elapsedTime = now - fundingTime;
						const totalBalance = Number(decodedState.global_total ?? '0');

						if (elapsedTime < lockupPeriod) {
							nextVestingDate = new Date((fundingTime + fullVestingTime) * 1000);
							lockedBalance = totalBalance;
							isFullyVested = false;
							nextVestingAmount =
								totalBalance / Number(decodedState.global_distribution_count ?? 1);
							remainingVestingAmount = totalBalance;
						} else if (elapsedTime >= fullVestingTime) {
							// If there's no lockup period, we start counting from funding time
							const vestingStartTime =
								lockupPeriod === 0 ? fundingTime : fundingTime + fullVestingTime;
							const vestingElapsedTime = now - vestingStartTime;
							const periodsPassed = Math.floor(
								vestingElapsedTime / Number(decodedState.global_distribution_seconds ?? 1)
							);
							const periodsRemaining =
								Number(decodedState.global_distribution_count ?? 0) - periodsPassed;

							if (periodsPassed >= Number(decodedState.global_distribution_count ?? 0)) {
								nextVestingDate = null;
								lockedBalance = 0;
								isFullyVested = true;
								nextVestingAmount = 0;
								remainingVestingAmount = 0;
							} else {
								const nextVestingTime =
									vestingStartTime +
									(periodsPassed + 1) * Number(decodedState.global_distribution_seconds ?? 0);
								nextVestingDate = new Date(nextVestingTime * 1000);

								const amountPerPeriod =
									totalBalance / Number(decodedState.global_distribution_count ?? 1);
								lockedBalance = amountPerPeriod * periodsRemaining;
								remainingVestingAmount = lockedBalance;
								nextVestingAmount = amountPerPeriod;
								isFullyVested = false;
							}
						} else {
							const vestingStartTime = fundingTime + fullVestingTime;
							nextVestingDate = new Date(vestingStartTime * 1000);
							lockedBalance = totalBalance;
							isFullyVested = false;
							nextVestingAmount =
								totalBalance / Number(decodedState.global_distribution_count ?? 1);
							remainingVestingAmount = totalBalance;
						}

						// Calculate available withdrawal amount considering minimum balance
						const minimumBalance = (accountInfo as unknown as Record<string, number>)[
							'min-balance'
						];
						availableForWithdrawal = Math.max(0, currentBalance - lockedBalance - minimumBalance);
					}

					// Get consensus data
					const consensusInfo = await getConsensusInfo(account.address, true);
					consensusData[account.address] = consensusInfo;

					return {
						contractId: account.contractId,
						contractAddress: account.address,
						owner: decodedState.global_owner ?? '',
						balance: currentBalance,
						isParticipating: accountInfo.status === 'Online',
						lockupPeriod:
							Number(decodedState.global_lockup_delay ?? 0) *
							Number(decodedState.global_period ?? 0) *
							Number(decodedState.global_period_seconds ?? 0),
						vestingPeriod:
							Number(decodedState.global_distribution_count ?? 0) *
							Number(decodedState.global_distribution_seconds ?? 0),
						totalAmount: decodedState.global_total ?? '0',
						fundingTime,
						nextVestingDate,
						lockedBalance,
						availableForWithdrawal,
						isFullyVested,
						nextVestingAmount,
						remainingVestingAmount,
						distributionCount: Number(decodedState.global_distribution_count ?? 0),
						distributionSeconds: Number(decodedState.global_distribution_seconds ?? 0),
						lockupDelay: Number(decodedState.global_lockup_delay ?? 0),
						vestingDelay: Number(decodedState.global_vesting_delay ?? 0),
						periodSeconds: Number(decodedState.global_period_seconds ?? 0),
						period: Number(decodedState.global_period ?? 0),
						consensusDetails: consensusInfo,
						accountInfo: accountInfo as unknown as ContractDetails['accountInfo']
					};
				} catch (err) {
					console.error('Error loading contract:', err);
					return null;
				}
			});

			// Wait for all promises to resolve and filter out any null results
			const results = await Promise.all(contractPromises);
			if (sequence !== loadSequence) return;
			contracts = results.filter((contract) => contract !== null) as ContractDetails[];
			failedCount = results.length - contracts.length;
		} catch (err) {
			if (sequence !== loadSequence) return;
			console.error('Error loading contracts:', err);
			error = 'Failed to load contract data';
		} finally {
			if (sequence === loadSequence) isLoading = false;
		}
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat('en-US', {
			maximumFractionDigits: 2,
			minimumFractionDigits: 2
		}).format(num / 1_000_000); // Convert from microVOI to VOI
	}

	function handleWithdrawClick(contract: ContractDetails) {
		selectedContract = contract;
		showWithdrawModal = true;
	}

	async function handleWithdrawSuccess(forceRefresh = false) {
		if (forceRefresh) {
			await loadContractDetails();
		}
		selectedContract = null;
	}

	function handleRegisterVoteKey(contract: ContractDetails) {
		selectedContract = contract;
		showRegisterVoteKey = true;
	}

	async function handleVoteKeySuccess(forceRefresh = false) {
		if (forceRefresh) {
			await loadContractDetails();
		}
		selectedContract = null;
		showRegisterVoteKey = false;
	}

	$: {
		if (childAccounts && childAccounts.length > 0) {
			// TASK-109: browser only. A server render must not write module-level stores or call upstream on every
			// request; it keeps the loading state.
			if (browser) loadContractDetails();
		} else {
			loadSequence++;
			isLoading = false;
			contracts = [];
			failedCount = 0;
		}
	}
</script>

<div class="space-y-8">
	<div class="flex items-center justify-between">
		<h2 class="text-2xl font-bold text-gray-900 dark:text-white">Lock+Vest Contracts</h2>
		<button
			on:click={loadContractDetails}
			class="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
			disabled={isLoading}
		>
			<i class="fas fa-sync-alt {isLoading ? 'animate-spin' : ''}"></i>
			<span class="sr-only">Refresh contract data</span>
		</button>
	</div>

	{#if isLoading}
		<div class="flex justify-center items-center h-64">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
		</div>
	{:else if error}
		<div
			class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
		>
			<p class="text-red-600 dark:text-red-400">{error}</p>
		</div>
	{:else if contracts.length === 0 && failedCount > 0}
		<div
			class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
		>
			<p class="text-red-600 dark:text-red-400">
				{failedCount === 1 ? '1 contract' : `${failedCount} contracts`} could not be loaded
			</p>
		</div>
	{:else if contracts.length === 0}
		<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
			<p class="text-gray-600 dark:text-gray-400">No Lock+Vest contracts found for this wallet</p>
		</div>
	{:else}
		{#if failedCount > 0}
			<div
				class="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4"
			>
				<p class="text-yellow-800 dark:text-yellow-300">
					{failedCount} of {failedCount + contracts.length} contracts could not be loaded; the totals
					exclude them.
				</p>
			</div>
		{/if}
		<!-- Summary Stats -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
				<h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Contracts</h3>
				<p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{contracts.length}</p>
			</div>
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
				<h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Locked Balance</h3>
				<p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
					{formatNumber(contracts.reduce((sum, c) => sum + c.lockedBalance, 0))} VOI
				</p>
			</div>
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
				<h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">
					Total Available for Withdrawal
				</h3>
				<p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
					{formatNumber(contracts.reduce((sum, c) => sum + c.availableForWithdrawal, 0))} VOI
				</p>
			</div>
		</div>

		<!-- If user's selected wallet is a watch account, show a message -->
		{#if ($selectedWallet?.app || 'Watch') === 'Watch'}
			<div
				class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4"
			>
				<p class="text-yellow-600 dark:text-yellow-400 text-center">
					The selected account is a Watch account. To withdraw or register node participation keys,
					please connect your wallet.
				</p>
			</div>
		{/if}

		<!-- Contract List -->
		<div class="space-y-6">
			{#each contracts as contract}
				<LockContract
					{contract}
					onWithdrawClick={handleWithdrawClick}
					onRegisterVoteKeyClick={handleRegisterVoteKey}
				/>
			{/each}
		</div>
	{/if}
</div>

{#if selectedContract && showWithdrawModal}
	<WithdrawModal
		contract={selectedContract}
		bind:show={showWithdrawModal}
		onSuccess={handleWithdrawSuccess}
	/>
{/if}

{#if selectedContract && showRegisterVoteKey}
	<RegisterVoteKey
		walletAddress={selectedContract.contractAddress}
		parentWalletAddress={selectedContract.owner}
		contractId={selectedContract.contractId}
		isOnline={selectedContract.isParticipating}
		bind:showModal={showRegisterVoteKey}
		onSuccess={handleVoteKeySuccess}
	/>
{/if}
