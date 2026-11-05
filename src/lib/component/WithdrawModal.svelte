<script lang="ts">
	import type { ContractDetails } from '$lib/types';
	import { microVOIToVOI, VOIToMicroVOI } from '$lib/utils/format';
	import { abi, CONTRACT } from 'ulujs';
	import {
		selectedWallet,
		signTransactions,
		captureSigner,
		type TransactionSigner
	} from '$lib/chain/wallet.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { canOfferWithdraw, sendWithdrawal } from '$lib/chain/withdrawSend';
	import { explainWait, minutesUntilExpiry } from '$lib/chain/withdrawalWait';
	import algosdk from 'algosdk';
	import { algodClient, algodIndexer } from '$lib/utils/algod';
	import { awaitWithdrawalConfirmation } from '$lib/chain/withdrawConfirmation';
	import { trackPending } from '$lib/chain/sendAndConfirm';
	import { createSendDeps, createTrackingDeps } from '$lib/chain/trackingDeps';
	import { pendingInfoFrom } from '$lib/chain/algodShapes';
	import {
		clearPendingWithdrawal,
		getPendingWithdrawal,
		pendingWithdrawalStorageKey
	} from '$lib/chain/pendingWithdrawals';

	export let contract: ContractDetails;
	export let show = false;
	export let onSuccess: (forceRefresh?: boolean) => void;

	let withdrawAmountVOI: number | null = null;
	let error: string | null = null;
	let isLoading = false;
	let txStatus: 'idle' | 'building' | 'signing' | 'confirming' | 'confirmed' | 'pending' | 'error' =
		'idle';
	let txId: string | null = null;
	let poolError: string | null = null;
	let trackController: AbortController | undefined;
	let waitTimer: ReturnType<typeof setInterval> | undefined;
	let waitMinutes: number | null = null;
	let waitKind: ReturnType<typeof explainWait>['kind'] = 'confirming';
	const windowEndedMessage =
		"This withdrawal's valid window has ended, but the history service has not yet confirmed whether it landed. We keep checking, and you can withdraw again as soon as that is known.";
	let recordTick = 0;
	let withdrawOffered = false;
	// The wallet captured when a withdrawal is submitted. Everything below reads this, never the live
	// selection, so switching accounts mid-flow cannot move the hold to another wallet's key.
	let flowWallet: string | undefined;
	$: activeWallet = flowWallet ?? $selectedWallet?.address;

	const sendDeps = createSendDeps(algodClient);

	// Read storage before rendering, including on each open and cross-tab storage change.
	$: {
		void recordTick;
		withdrawOffered = canOfferWithdraw({
			status: show ? txStatus : 'closed',
			wallet: activeWallet,
			contractId: contract.contractId
		});
	}

	function handleStorage(event: StorageEvent) {
		const wallet = activeWallet;
		if (wallet && event.key === pendingWithdrawalStorageKey(wallet, contract.contractId))
			recordTick++;
	}

	onMount(() => {
		window.addEventListener('storage', handleStorage);
	});

	onDestroy(() => {
		trackController?.abort();
		clearInterval(waitTimer);
		if (typeof window !== 'undefined') window.removeEventListener('storage', handleStorage);
	});

	// Convert microVOI to VOI for display
	$: availableBalanceVOI = microVOIToVOI(contract.availableForWithdrawal);
	$: currentBalanceVOI = microVOIToVOI(contract.balance);
	$: lockedBalanceVOI = microVOIToVOI(contract.lockedBalance);
	$: explorerUrl = txId ? `https://block.voi.network/explorer/transaction/${txId}` : null;

	function setMaxAmount() {
		withdrawAmountVOI = availableBalanceVOI;
	}

	function handleClose() {
		if (txStatus !== 'building' && txStatus !== 'signing' && txStatus !== 'confirming') {
			trackController?.abort();
			clearInterval(waitTimer);
			show = false;
			flowWallet = undefined;
			// A pending withdrawal may still land, so refresh for either submitted outcome.
			if (txStatus === 'confirmed' || txStatus === 'pending') {
				onSuccess?.(true);
			} else {
				onSuccess?.(false);
			}
			// Reset state
			txStatus = 'idle';
			txId = null;
			error = null;
			poolError = null;
			waitMinutes = null;
			withdrawAmountVOI = null;
		}
	}

	const pendingInfo = async (id: string) =>
		pendingInfoFrom(await algodClient.pendingTransactionInformation(id).do());

	async function trackWithdrawal(id: string, lastValid: number, wallet: string) {
		const contractId = contract.contractId;
		// Set here, not in the reactive resume block, which reads activeWallet (a reactive cycle).
		flowWallet = wallet;
		trackController?.abort();
		clearInterval(waitTimer);
		trackController = new AbortController();
		const { signal } = trackController;
		const trackingDeps = { ...sharedTrackingDeps };
		let foundUnconfirmed = false;
		let currentRound = Number.NaN; // unknown until algod answers once
		txStatus = 'pending';
		waitMinutes = null;
		waitKind = 'confirming';

		const pause = (ms: number) =>
			new Promise<void>((resolve) => {
				if (signal.aborted) return resolve();
				const timeout = setTimeout(finish, ms);
				signal.addEventListener('abort', finish, { once: true });
				function finish() {
					clearTimeout(timeout);
					signal.removeEventListener('abort', finish);
					resolve();
				}
			});
		const updateEstimate = () => {
			if (!signal.aborted) {
				waitKind = explainWait({ lastValid, currentRound, foundUnconfirmed }).kind;
				waitMinutes = foundUnconfirmed ? minutesUntilExpiry(lastValid, currentRound) : null;
			}
		};
		const updateRound = async () => {
			try {
				currentRound = await trackingDeps.algodRound();
			} catch {
				// Keep the last known round: forgetting it would flip the explanation text back and forth.
			}
			updateEstimate();
		};
		void updateRound();
		const timer = setInterval(() => void updateRound(), 30000);
		waitTimer = timer;

		const readPending = trackingDeps.pendingInfo;
		trackingDeps.pendingInfo = async (id) => {
			const info = await readPending(id);
			if (!signal.aborted && !((info['confirmed-round'] ?? 0) > 0)) {
				foundUnconfirmed = true;
				updateEstimate();
			}
			return info;
		};

		try {
			while (!signal.aborted) {
				try {
					// Retain the first pass for quick confirmation and escaped pool-error reporting.
					const outcome = await awaitWithdrawalConfirmation(id, {
						pendingInfo: async (id) => {
							if (signal.aborted) return {};
							const info = await pendingInfo(id);
							if (!signal.aborted && !((info['confirmed-round'] ?? 0) > 0)) {
								foundUnconfirmed = true;
								updateEstimate();
							}
							return info;
						},
						pause
					});
					if (signal.aborted) return;
					if (outcome.status === 'confirmed') {
						txStatus = 'confirmed';
						clearPendingWithdrawal(wallet, contractId, id);
						return;
					}
					poolError = outcome.poolError ?? null;
					const tracked = await trackPending(
						{ status: 'pending', txIds: [id], firstTxId: id, lastValid },
						trackingDeps,
						{ signal }
					);
					if (signal.aborted) return;
					if (tracked.status === 'confirmed') {
						txStatus = 'confirmed';
						clearPendingWithdrawal(wallet, contractId, id);
						return;
					} else if (tracked.status === 'expired') {
						txStatus = 'error';
						error =
							'The earlier withdrawal expired without going through. Close this window and open it again to withdraw.';
						clearPendingWithdrawal(wallet, contractId, id);
						return;
					}
				} catch {
					if (signal.aborted) return;
					txStatus = 'pending';
					await pause(15000);
				}
			}
		} finally {
			clearInterval(timer);
		}
	}

	const sharedTrackingDeps = createTrackingDeps(algodClient, algodIndexer);

	// Read again on storage events so a form already open in another tab resumes the hold.
	$: {
		void recordTick;
		if (show && txStatus === 'idle') {
			const wallet = activeWallet;
			const earlier = wallet ? getPendingWithdrawal(wallet, contract.contractId) : undefined;
			if (wallet && earlier) {
				txId = earlier.txId;
				void trackWithdrawal(earlier.txId, earlier.lastValid, wallet);
			}
		}
	}

	async function handleWithdraw() {
		if (!$selectedWallet?.address) {
			error = 'Connect a wallet to withdraw';
			return;
		}
		// The account the user confirmed; it signs and keys the hold, wherever the picker goes.
		let signer: TransactionSigner;
		try {
			signer = captureSigner();
		} catch (captureError) {
			error = captureError instanceof Error ? captureError.message : String(captureError);
			return;
		}
		const wallet = signer.address;
		if (!canOfferWithdraw({ status: txStatus, wallet, contractId: contract.contractId })) {
			recordTick++;
			return;
		}
		if (withdrawAmountVOI === null || withdrawAmountVOI <= 0) {
			error = 'Please enter a valid amount';
			return;
		}

		if (withdrawAmountVOI > availableBalanceVOI) {
			error = 'Amount exceeds available balance';
			return;
		}

		if (!contract.owner || !contract.contractId) {
			error = 'Missing parent wallet address or contract ID';
			return;
		}

		flowWallet = wallet;
		isLoading = true;
		error = null;
		txStatus = 'building';

		try {
			// Convert VOI to microVOI for the actual withdrawal
			const withdrawAmountMicroVOI = VOIToMicroVOI(withdrawAmountVOI ?? 0);

			const ctcInfo = Number(contract.contractId);

			const schema = {
				name: 'Withdraw',
				desc: 'Withdraw from the contract',
				methods: [
					{
						name: 'withdraw',
						args: [
							{
								type: 'uint64',
								name: 'amount'
							}
						],
						readonly: false,
						returns: {
							type: 'uint64'
						}
					}
				],
				events: []
			};

			const builder = {
				wnt: new CONTRACT(
					ctcInfo,
					algodClient,
					null,
					schema,
					{
						addr: contract.owner,
						sk: new Uint8Array(0)
					},
					true,
					false,
					true
				)
			};

			const ci = new CONTRACT(ctcInfo, algodClient, null, abi.custom, {
				addr: contract.owner,
				sk: new Uint8Array(0)
			});

			const txnO = {
				...(await builder.wnt.withdraw(withdrawAmountMicroVOI)).obj,
				payment: 2000
			};

			ci.setFee(2000);
			ci.setEnableGroupResourceSharing(true);
			ci.setExtraTxns([txnO]);
			const customR = await ci.custom();

			const txns: algosdk.Transaction[] = customR.txns.map((txn: string) =>
				algosdk.decodeUnsignedTransaction(new Uint8Array(Buffer.from(txn, 'base64')))
			);

			txStatus = 'signing';
			const outcome = await sendWithdrawal(
				{ wallet, contractId: contract.contractId, txns },
				{
					sign: (groups) => signTransactions(groups, signer),
					send: sendDeps
				}
			);
			txId = 'txId' in outcome ? outcome.txId : null;
			if (
				outcome.status === 'not-recorded' ||
				outcome.status === 'not-signed' ||
				outcome.status === 'rejected'
			) {
				txStatus = 'error';
				error = outcome.error;
				flowWallet = undefined;
			} else if (outcome.status === 'confirmed') {
				txStatus = 'confirmed';
			} else {
				await trackWithdrawal(outcome.txId, outcome.lastValid, wallet);
			}
		} catch (err) {
			txStatus = 'error';
			flowWallet = undefined;
			error = 'Failed to process withdrawal';
			console.error('Withdrawal error:', err);
		} finally {
			isLoading = false;
		}
	}

	$: formattedWithdrawAmount = withdrawAmountVOI ? withdrawAmountVOI.toFixed(2) : '0.00';
</script>

{#if show}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
			<!-- Header -->
			<div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Withdraw VOI</h3>
			</div>

			<!-- Content -->
			<div class="px-6 py-4 space-y-4">
				{#if txStatus === 'confirmed'}
					<div class="text-center space-y-4">
						<div
							class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900"
						>
							<i class="fas fa-check text-green-600 dark:text-green-400 text-xl"></i>
						</div>
						<div class="text-center">
							<h3 class="text-lg font-medium text-gray-900 dark:text-white">
								Withdrawal Successful
							</h3>
							<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
								{#if withdrawAmountVOI}
									Your withdrawal of {formattedWithdrawAmount} VOI has been confirmed.
								{:else}
									Your withdrawal has been confirmed.
								{/if}
							</p>
							{#if explorerUrl}
								<a
									href={explorerUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="mt-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
								>
									View on Explorer
									<i class="fas fa-external-link-alt ml-2"></i>
								</a>
							{/if}
						</div>
					</div>
				{:else if txStatus === 'pending' || txStatus === 'confirming'}
					<div class="text-center space-y-4">
						<h3 class="text-lg font-medium text-gray-900 dark:text-white">
							A withdrawal is in progress
						</h3>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							{#if waitKind === 'window-ended'}
								{windowEndedMessage}
							{:else if waitKind === 'expires-in'}
								Waiting for an earlier withdrawal to expire, about {waitMinutes} min.
							{:else}
								Waiting for it to be confirmed on the network.
							{/if}
						</p>
						{#if poolError}
							<p class="text-sm text-gray-500 dark:text-gray-400">{poolError}</p>
						{/if}
						{#if explorerUrl}
							<a
								href={explorerUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="mt-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
							>
								View on Explorer
								<i class="fas fa-external-link-alt ml-2"></i>
							</a>
						{/if}
					</div>
				{:else if txStatus === 'error'}
					<div class="text-center space-y-4">
						<div
							class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900"
						>
							<i class="fas fa-exclamation-triangle text-red-600 dark:text-red-400 text-xl"></i>
						</div>
						<div class="text-center">
							<h3 class="text-lg font-medium text-gray-900 dark:text-white">Transaction Failed</h3>
							<p class="mt-2 text-sm text-red-600 dark:text-red-400">
								{error || 'An error occurred while processing your withdrawal.'}
							</p>
						</div>
					</div>
				{:else}
					<!-- Transaction Status -->
					{#if txStatus !== 'idle'}
						<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
							<div class="flex items-center space-x-3">
								<div class="flex-shrink-0">
									{#if txStatus === 'building'}
										<i class="fas fa-cog animate-spin text-blue-500"></i>
									{:else if txStatus === 'signing'}
										<i class="fas fa-pen animate-pulse text-blue-500"></i>
									{/if}
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-gray-900 dark:text-white">
										{#if txStatus === 'building'}
											Building Transaction
										{:else if txStatus === 'signing'}
											Waiting for Signature
										{/if}
									</p>
								</div>
							</div>
						</div>
					{/if}

					<!-- Contract Info -->
					<div class="space-y-2">
						<div class="flex justify-between text-sm">
							<span class="text-gray-600 dark:text-gray-400">Contract ID</span>
							<span class="font-medium text-gray-900 dark:text-white">{contract.contractId}</span>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-gray-600 dark:text-gray-400">Current Balance</span>
							<span class="font-medium text-gray-900 dark:text-white"
								>{currentBalanceVOI.toLocaleString()} VOI</span
							>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-gray-600 dark:text-gray-400">Locked Balance</span>
							<span class="font-medium text-gray-900 dark:text-white"
								>{lockedBalanceVOI.toLocaleString()} VOI</span
							>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-gray-600 dark:text-gray-400">Available Balance</span>
							<span class="font-medium text-gray-900 dark:text-white"
								>{availableBalanceVOI.toLocaleString()} VOI</span
							>
						</div>
					</div>

					{#if withdrawOffered}
						<!-- Amount Input -->
						<div class="space-y-2">
							<label
								for="amount"
								class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								Withdrawal Amount (VOI)
							</label>
							<div class="relative rounded-md shadow-sm">
								<input
									type="number"
									id="amount"
									bind:value={withdrawAmountVOI}
									min="0"
									max={availableBalanceVOI}
									step="0.000001"
									class="block w-full pr-20 border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
									placeholder="0.00"
									disabled={!withdrawOffered}
								/>
								<div class="absolute inset-y-0 right-0 flex items-center">
									<button
										type="button"
										on:click={setMaxAmount}
										class="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
										disabled={!withdrawOffered}
									>
										MAX
									</button>
								</div>
							</div>
							<p class="text-sm text-gray-500 dark:text-gray-400">
								{formattedWithdrawAmount} VOI
							</p>
						</div>
					{/if}

					{#if error}
						<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div
				class="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex justify-end space-x-3"
			>
				<button
					type="button"
					on:click={handleClose}
					class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md"
					disabled={txStatus === 'building' || txStatus === 'signing' || txStatus === 'confirming'}
				>
					{txStatus === 'confirmed' || txStatus === 'pending' || txStatus === 'error'
						? 'Close'
						: 'Cancel'}
				</button>
				{#if withdrawOffered}
					<button
						type="button"
						on:click={handleWithdraw}
						disabled={!withdrawOffered ||
							isLoading ||
							withdrawAmountVOI === null ||
							withdrawAmountVOI <= 0 ||
							withdrawAmountVOI > availableBalanceVOI}
						class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{#if isLoading}
							<i class="fas fa-spinner animate-spin mr-2"></i>
						{/if}
						Withdraw
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
