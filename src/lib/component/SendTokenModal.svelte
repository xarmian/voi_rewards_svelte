<script lang="ts">
	import {
		pageAccountState,
		signerMatchesAccount,
		wrongSignerMessage
	} from '$lib/chain/signerGate';
	import { requireAccountInfo } from '$lib/stores/accounts';
	import {
		applyRecipientLookup,
		loadRecipientInfo,
		nextLookupId,
		tokenKey,
		type RecipientTokenKind
	} from '$lib/chain/recipientInfo';
	import { runBounded } from '$lib/chain/boundedPool';
	import { createFlowPin } from '$lib/chain/flowAccount';
	import { iconUrl, isIconMissing, markIconMissing } from '$lib/utils/tokenIcons';
	import { Modal, Button, Input, Label } from 'flowbite-svelte';
	import {
		signTransactions,
		connectedWallets,
		capturePageSigner,
		type TransactionSigner
	} from '$lib/chain/wallet.svelte';
	import { algodClient, algodIndexer } from '$lib/utils/algod';
	import algosdk from 'algosdk';
	import { onDestroy, tick } from 'svelte';
	import { sendGroups, retryRecipients } from '$lib/chain/groupSend';
	import { decimalToBaseUnits, sumBaseUnits } from '$lib/chain/baseUnits';
	import { type Outcome, type TrackedOutcome } from '$lib/chain/sendAndConfirm';
	import { createSendDeps, createTrackingDeps } from '$lib/chain/trackingDeps';
	import {
		buildAssetTransfer,
		buildCombinedPayment,
		buildPayment,
		withNoteNoGroup
	} from '$lib/chain/txBuilders';
	import {
		createOutcomeHandler,
		createPendingTracker,
		type PendingSendEntry,
		type PendingTracker
	} from '$lib/chain/pendingSends';
	import type { FungibleTokenType } from '$lib/types/assets';
	import { arc200 as Contract } from 'ulujs';
	import CopyComponent from '$lib/component/ui/CopyComponent.svelte';
	import ImportRecipientsModal from './ImportRecipientsModal.svelte';
	import RecipientRow from './RecipientRow.svelte';
	import type { Recipient } from '$lib/types/recipients';
	import { rowKeys } from '$lib/utils/rowKeys';

	// Constants for Algorand transaction limits
	const MAX_TXN_PER_GROUP = 16;
	const MAX_GROUPS_PER_SIGNING = 16;
	const flow = createFlowPin();
	let pinTick = 0;

	export let accountAddress: string | undefined = undefined;
	export let tokens: FungibleTokenType[];

	$: availableTokens = tokens.filter((t) => !isLPToken(t)) as FungibleTokenType[];
	// Indexer pages aren't deduped and a token without an id falls back to '0' (native VOI).
	$: tokenKeys = rowKeys(availableTokens, (t) => String(t.id ?? '0'));

	// Helper function to check if a token is an LP token
	function isLPToken(token: FungibleTokenType) {
		return 'poolInfo' in token && token.poolInfo !== undefined;
	}

	// Click outside action
	function clickOutside(node: HTMLElement, callback: () => void) {
		const handleClick = (event: MouseEvent) => {
			// Don't close if clicking inside the import modal
			const importModal = document.querySelector('[data-modal-import]');
			if (importModal && importModal.contains(event.target as Node)) {
				return;
			}

			if (node && !node.contains(event.target as Node) && !event.defaultPrevented) {
				callback();
			}
		};

		document.addEventListener('click', handleClick, true);

		return {
			destroy() {
				document.removeEventListener('click', handleClick, true);
			},
			update(newCallback: () => void) {
				callback = newCallback;
			}
		};
	}

	export let open = false;
	export let token:
		| FungibleTokenType
		| {
				type: 'native';
				symbol: 'VOI';
				decimals: number;
				balance: number;
				name: string;
				id?: undefined;
		  };
	export let onTokenSent: () => void;

	type SendToken = typeof token;
	let selectedToken = token;
	let sentToken: SendToken | null = null;
	let missingIconIds = new Set<string>();
	$: selectedIconId = isNativeToken(selectedToken) ? '0' : String(selectedToken.id ?? '');
	let isInitialLoad = true;
	let notice: string | null = null;

	// Create the native VOI token object with proper initialization
	let nativeVoiToken: FungibleTokenType = {
		id: '0',
		name: 'Voi',
		symbol: 'VOI',
		decimals: 6,
		balance: isNativeToken(token) ? token.balance : 0,
		verified: true,
		imageUrl: `https://asset-verification.nautilus.sh/icons/0.png`,
		value: isNativeToken(token) ? token.balance / 1e6 : 0,
		type: 'native'
	};

	// Fetch VOI balance only on initial modal open
	$: {
		void pinTick;
		const address = flow.current(accountAddress);
		if (open && address && isInitialLoad && !flow.pinned) {
			isInitialLoad = false;
			requireAccountInfo(address, { force: true })
				.then((info) => {
					if (address !== flow.current(accountAddress)) return;
					nativeVoiToken = {
						...nativeVoiToken,
						balance: Number(info.amount),
						value: Number(info.amount) / 1e6
					};
					// If the selected token is native VOI, update it too
					if (isNativeToken(selectedToken)) {
						selectedToken = {
							...selectedToken,
							balance: Number(info.amount)
						};
					}
					// Force Svelte reactivity for available tokens
					availableTokens = [nativeVoiToken, ...availableTokens.filter((t) => t.id !== '0')];
				})
				.catch(console.error);
		}
	}
	// Reset isInitialLoad when modal closes
	$: if (!open) {
		isInitialLoad = true;
	}

	function onIconError(tokenId: string) {
		markIconMissing(tokenId);
		missingIconIds.add(tokenId);
		missingIconIds = missingIconIds;
	}

	// Update the selected token when the token prop changes
	$: if (token) {
		syncTokenProp(token);
	}

	// Update maxAmount when selected token changes
	$: maxAmount = Number(
		enforceDecimals(
			selectedToken.balance / Math.pow(10, selectedToken.decimals),
			selectedToken.decimals
		)
	);

	let recipients: Recipient[] = [
		{ address: null, amount: '', note: '', info: null, isLoading: false, isValid: false }
	];
	let isSending = false;
	let txState: 'idle' | 'building' | 'awaiting' | 'sending' = 'idle';
	let error: string | null = null;
	let showResults = false;
	let currentTxnGroup = 0;
	let totalTxnGroups = 0;
	let transactionGroups: algosdk.Transaction[][] = [];
	let showAmountMenu = false;
	let amountToDistribute = '';
	let hasCompletedTransaction = false;
	let showImportModal = false;
	let showCombineOptions = false;
	let groupOutcomes: (TrackedOutcome | undefined)[] = [];
	let recipientsByGroup: Recipient[][] = [];
	let pendingController: AbortController | undefined;
	const sendDeps = createSendDeps(algodClient);
	const trackingDeps = createTrackingDeps(algodClient, algodIndexer);
	$: retryList = retryRecipients(groupOutcomes, recipientsByGroup);
	$: confirmedTotal = Number(
		enforceDecimals(
			groupOutcomes.reduce(
				(sum, outcome, index) =>
					outcome?.status === 'confirmed'
						? sum +
							recipientsByGroup[index].reduce(
								(total, recipient) => total + Number(recipient.amount),
								0
							)
						: sum,
				0
			),
			(sentToken ?? selectedToken).decimals
		)
	);
	$: statusCounts = {
		confirmed: groupOutcomes.filter((o) => o?.status === 'confirmed').length,
		pending: groupOutcomes.filter((o) => o?.status === 'pending').length,
		expired: groupOutcomes.filter((o) => o?.status === 'expired').length,
		rejected: groupOutcomes.filter((o) => o?.status === 'rejected').length
	};
	let tracker: PendingTracker | undefined;
	let trackerWallet: string | undefined;
	let trackedEntries: PendingSendEntry[] = [];
	let showCloseConfirm = false;
	let keepOpenButton: HTMLButtonElement | undefined;
	$: {
		void pinTick;
		syncTracker(open, flow.current(accountAddress));
	}
	$: if (flow.pinned && (!open || (txState === 'idle' && !showResults && !isSending))) {
		flow.release();
		pinTick++;
		isInitialLoad = true;
	}
	$: closeNeedsConfirm =
		txState === 'sending' || trackedEntries.some((entry) => entry.status === 'pending');
	$: awaitingEntries = trackedEntries.filter(
		(entry) => !groupOutcomes.some((outcome) => outcome?.txIds[0] === entry.record.firstTxId)
	);
	$: if (!open) {
		pendingController?.abort();
		tracker?.stop();
		showCloseConfirm = false;
	}
	onDestroy(() => {
		pendingController?.abort();
		tracker?.stop();
		flow.dispose();
	});

	function syncTracker(isOpen: boolean, wallet: string | undefined) {
		if (!isOpen) return;
		if (wallet !== trackerWallet) {
			tracker?.stop();
			tracker = undefined;
			trackerWallet = wallet;
			trackedEntries = [];
		}
		if (!wallet) return;
		if (!tracker) {
			const nextTracker: PendingTracker = createPendingTracker({
				wallet,
				deps: trackingDeps,
				onChange: (entries) => {
					if (tracker !== nextTracker) return;
					// The wallet's pending bridge sends belong to BridgeModal.
					trackedEntries = entries.filter((entry) => entry.record.kind === 'send');
					hasCompletedTransaction ||= trackedEntries.some((entry) => entry.status === 'confirmed');
					groupOutcomes = groupOutcomes.map((outcome): TrackedOutcome | undefined => {
						if (outcome?.status !== 'pending') return outcome;
						const entry = entries.find((entry) => entry.record.firstTxId === outcome.firstTxId);
						if (entry?.status === 'confirmed') {
							return {
								status: 'confirmed',
								txIds: outcome.txIds,
								confirmedRound: entry.confirmedRound ?? 0
							};
						}
						if (entry?.status === 'expired') return { status: 'expired', txIds: outcome.txIds };
						return outcome;
					});
				}
			});
			tracker = nextTracker;
		}
		tracker.resume();
	}

	async function requestClose() {
		if (!closeNeedsConfirm) {
			handleClose();
			return;
		}
		showCloseConfirm = true;
		await tick();
		keepOpenButton?.focus();
	}

	function handleCloseKeydown(event: KeyboardEvent) {
		if (open && closeNeedsConfirm && event.key === 'Escape') {
			event.preventDefault();
			void requestClose();
		}
	}

	function recordOutcome(outcome: Outcome, index: number) {
		groupOutcomes[index] = outcome;
		groupOutcomes = [...groupOutcomes];
		hasCompletedTransaction ||= outcome.status !== 'rejected';
	}
	let showTokenSelect = false;
	let showNoteMenu = false;
	let noteForAll = '';

	function enforceDecimals(value: string | number, decimals: number): string {
		if (!value) return '';

		// Preserve typed decimal strings and support existing numeric callers.
		const strValue = typeof value === 'string' ? value.trim() : value.toString();
		const [whole, fraction = ''] = strValue.split('.');

		// If no decimals, return the whole number
		if (decimals === 0) return whole;

		// Truncate fraction to max decimals
		const truncatedFraction = fraction.slice(0, decimals);

		// Return formatted number with correct decimals
		return truncatedFraction ? `${whole}.${truncatedFraction}` : whole;
	}

	$: totalAmount = Number(
		enforceDecimals(
			recipients.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
			selectedToken.decimals
		)
	);
	$: isValidTotalAmount = withinBalance(recipients, selectedToken);

	// The exact base-unit total must be positive and not exceed the balance; floats drift.
	function withinBalance(rows: Recipient[], token: SendToken): boolean {
		try {
			const total = sumBaseUnits(
				rows.map((r) => r.amount),
				token.decimals
			);
			return total > 0n && total <= BigInt(Math.floor(token.balance));
		} catch {
			return false;
		}
	}
	$: canSubmit =
		recipients.every((r) => {
			// Basic validation for all token types
			const basicValidation = r.address && r.amount && r.isValid && r.info !== null;
			if (!basicValidation) return false;

			// Additional validation for VSA (non-native, non-ARC200 tokens)
			if (!isNativeToken(selectedToken) && !isARC200Token(selectedToken)) {
				// Check if recipient has opted in
				return r.info?.hasOptedIn === true;
			}

			return true;
		}) &&
		isValidTotalAmount &&
		!isSending;

	$: isValidAmount = amountToDistribute && Number(amountToDistribute) > 0;
	$: canSplitEvenly = isValidAmount && Number(amountToDistribute) <= maxAmount;
	$: canMaxEach = isValidAmount && Number(amountToDistribute) * recipients.length <= maxAmount;
	$: totalRequiredForMax = isValidAmount ? Number(amountToDistribute) * recipients.length : 0;

	function addRecipient() {
		recipients = [
			...recipients,
			{ address: null, amount: '', note: '', info: null, isLoading: false, isValid: false }
		];
	}

	const LOOKUP_BANNER =
		"Couldn't check this recipient. Sending is blocked until it can be checked.";

	// The banner follows the rows: while any row has a lookup error it is shown and takes precedence
	// over another message, because that failure blocks the send. It is cleared only when it is the
	// banner itself, so an unrelated message is never cleared by this helper.
	function syncLookupBanner() {
		if (recipients.some((r) => r.lookupError)) {
			error = LOOKUP_BANNER;
		} else if (error === LOOKUP_BANNER) {
			error = null;
		}
	}

	function removeRecipient(index: number) {
		recipients = recipients.filter((_, i) => i !== index);
		syncLookupBanner();
	}

	async function fetchRecipientInfo(address: string, ticket: number) {
		const checkedToken = selectedToken;
		const checkedTokenKey = tokenKey(checkedToken);
		const token: RecipientTokenKind = isNativeToken(checkedToken)
			? { kind: 'native' }
			: isARC200Token(checkedToken)
				? { kind: 'arc200' }
				: { kind: 'vsa', assetId: Number(checkedToken.id) };
		const result = await loadRecipientInfo(address, token, {
			fetchAccount: async (a) => requireAccountInfo(a, { force: true }),
			arc200BalanceOf: async (a) => {
				const contract = new Contract(Number(checkedToken.id), algodClient, algodIndexer);
				const balance = await contract.arc200_balanceOf(a);
				return {
					success: balance.success,
					returnValue: balance.success ? balance.returnValue : undefined
				};
			}
		});
		if (tokenKey(selectedToken) !== checkedTokenKey) return;
		if (!recipients.some((r) => r.address === address && r.isLoading && r.lookupId === ticket))
			return;
		recipients = applyRecipientLookup(recipients, address, ticket, result);
		syncLookupBanner();
		if (result.status === 'loaded') {
			notice = null;
		} else {
			console.error('Error fetching recipient info:', result.error);
		}
		recipients = [...recipients];
	}

	function handleRecipientAmountChange(index: number, amount: string) {
		recipients[index].amount = amount;
		// Force Svelte reactivity
		recipients = [...recipients];
	}

	function handleRecipientNoteChange(index: number, newNote: string) {
		recipients[index].note = newNote;
		// Force Svelte reactivity
		recipients = [...recipients];
	}

	function handleRecipientError(errorMessage: string | null) {
		if (errorMessage) {
			error = errorMessage;
			return;
		}
		syncLookupBanner();
	}

	async function buildVSATransaction(
		token: SendToken,
		sender: string,
		recipientAddress: string,
		amount: bigint,
		suggestedParams: algosdk.SuggestedParams,
		noteText?: string
	): Promise<algosdk.Transaction> {
		if (!sender) {
			throw new Error('Wallet not connected');
		}

		// VSA assets require asset transfer transaction
		if (!token.id || token.id === '0') {
			throw new Error('Invalid asset ID for VSA transaction');
		}

		return buildAssetTransfer({
			from: sender,
			to: recipientAddress,
			assetIndex: Number(token.id),
			amount,
			note: noteText ? new TextEncoder().encode(noteText) : undefined,
			suggestedParams
		});
	}

	async function buildARC200Transaction(
		token: SendToken,
		sender: string,
		recipientAddress: string,
		amount: bigint,
		index: number,
		noteText?: string
	): Promise<algosdk.Transaction[]> {
		if (!sender) {
			throw new Error('Wallet not connected');
		}

		const contract = new Contract(Number(token.id), algodClient, algodIndexer, {
			acc: {
				addr: sender,
				sk: new Uint8Array()
			}
		});

		const resp = await contract.arc200_transfer(recipientAddress, amount, true, false);

		if (!resp.success) {
			throw new Error('Failed to build ARC-200 transaction');
		}

		// Check if we have transaction data
		if (!('txns' in resp) || !resp.txns || !resp.txns.length) {
			throw new Error('No transactions returned from ARC-200 contract');
		}

		const decodedTxns: algosdk.Transaction[] = [];

		// Decode all transactions from the simulation response
		for (const txn of resp.txns) {
			const bytes = Buffer.from(txn, 'base64');
			const tx = algosdk.decodeUnsignedTransaction(bytes);

			// if the transaction is a payment, append the index of this transaction to its note
			let note: Uint8Array | undefined;
			if (tx.type === 'pay') {
				const existingNote = tx.note ? new TextDecoder().decode(tx.note) : '';
				note = new TextEncoder().encode(`${existingNote}${existingNote ? ' ' : ''}${index}`);
			} else if (noteText) {
				note = new TextEncoder().encode(noteText);
			}

			// The group id is dropped here; the groups are assigned again later.
			decodedTxns.push(withNoteNoGroup(tx, note));
		}

		return decodedTxns;
	}

	// Helper function to process items with rate limiting
	async function processWithRateLimit<T, R>(
		items: T[],
		processor: (item: T, index: number) => Promise<R>,
		rateLimit: number,
		onProgress?: (completed: number, total: number) => void
	): Promise<R[]> {
		const results: R[] = [];
		const chunks: T[][] = [];

		// Split items into chunks based on rate limit
		for (let i = 0; i < items.length; i += rateLimit) {
			chunks.push(items.slice(i, i + rateLimit));
		}

		let completed = 0;
		const total = items.length;

		// Process each chunk with rate limiting
		for (const chunk of chunks) {
			// Process items in chunk concurrently
			const chunkResults = await Promise.all(
				chunk.map(async (item) => {
					try {
						const globalIndex = items.indexOf(item);
						const result = await processor(item, globalIndex);
						completed++;
						onProgress?.(completed, total);
						return result;
					} catch (error) {
						console.error('Error processing item:', error);
						throw error;
					}
				})
			);

			results.push(...chunkResults);

			// Wait 1 second before processing next chunk (5 per second = 200ms per item)
			if (chunks.indexOf(chunk) < chunks.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		return results;
	}

	async function buildVOITransaction(
		token: SendToken,
		sender: string,
		recipientAddress: string,
		amount: bigint,
		suggestedParams: algosdk.SuggestedParams,
		noteText?: string
	): Promise<algosdk.Transaction> {
		if (!sender) {
			throw new Error('Wallet not connected');
		}
		return buildPayment({
			from: sender,
			to: recipientAddress,
			amount,
			note: noteText ? new TextEncoder().encode(noteText) : undefined,
			suggestedParams
		});
	}

	// Helper function to create optimized transaction groups
	function createOptimizedGroups(
		allTransactions: algosdk.Transaction[][],
		groupRecipients: Recipient[]
	): algosdk.Transaction[][] {
		// First, separate all transactions into payments and non-payments, maintaining the relationship
		const txPairs: {
			payment: algosdk.Transaction | null;
			nonPayment: algosdk.Transaction | null;
			recipient: Recipient;
		}[] = [];

		allTransactions.forEach((txSet, index) => {
			const payment = txSet.find((tx) => tx.type === 'pay') || null;
			const nonPayment = txSet.find((tx) => tx.type !== 'pay') || null;
			// Add pair regardless of transaction types
			txPairs.push({ payment, nonPayment, recipient: groupRecipients[index] });
		});

		// Initialize result array for groups
		const groups: algosdk.Transaction[][] = [];

		// Process transactions in groups, leaving room for the combined payment transaction
		const maxTransactionsPerBatch = MAX_TXN_PER_GROUP - 1;
		for (let i = 0; i < txPairs.length; i += maxTransactionsPerBatch) {
			// Get the current batch of pairs
			const currentBatch = txPairs.slice(i, i + maxTransactionsPerBatch);

			// Collect all valid transactions from the batch
			const batchTransactions: algosdk.Transaction[] = [];

			// First, handle payments if they exist
			const paymentsToProcess = currentBatch.filter((pair) => pair.payment !== null);
			if (paymentsToProcess.length > 0) {
				const totalPaymentAmount = paymentsToProcess.reduce(
					(sum, pair) => sum + BigInt(pair.payment?.payment?.amount ?? 0),
					0n
				);

				if (totalPaymentAmount > 0n) {
					const firstPayment = paymentsToProcess[0].payment!;
					const combinedPayment = buildCombinedPayment(firstPayment, totalPaymentAmount);
					batchTransactions.push(combinedPayment);
				}
			}

			// Then add all non-payment transactions
			const nonPaymentTransactions = currentBatch
				.filter((pair) => pair.nonPayment)
				.map((pair) => pair.nonPayment!);

			// Make sure we don't exceed MAX_TXN_PER_GROUP
			const remainingSlots = MAX_TXN_PER_GROUP - batchTransactions.length;
			batchTransactions.push(...nonPaymentTransactions.slice(0, remainingSlots));

			// If we have any transactions in this batch, create a group
			if (batchTransactions.length > 0) {
				if (batchTransactions.length > MAX_TXN_PER_GROUP) {
					throw new Error(
						`${batchTransactions.length} transactions grouped together but max group size is ${MAX_TXN_PER_GROUP}`
					);
				}
				groups.push(algosdk.assignGroupID(batchTransactions));
				recipientsByGroup.push(currentBatch.map((pair) => pair.recipient));
			}
		}

		return groups;
	}

	async function handleSend() {
		if (isSending) return;
		if (!canSignTransactions) {
			error = wrongSignerMessage();
			return;
		}

		const token = selectedToken;
		// The account the user confirmed; every batch signs as it.
		const target = accountAddress;
		let signer: TransactionSigner;
		try {
			signer = capturePageSigner(target);
		} catch (captureError) {
			error = captureError instanceof Error ? captureError.message : String(captureError);
			return;
		}
		if (!signerMatchesAccount(signer, target)) {
			error = wrongSignerMessage();
			return;
		}
		// After a failed send the pin keeps this form (tracker, token, balance checks) on that account
		// while its error shows, so a send for a different selection would sign as one account and be
		// validated against another's funds. Only the pinned account can retry; closing starts over.
		if (flow.pinned && flow.address !== signer.address) {
			error = wrongSignerMessage();
			return;
		}
		const sender = signer.address;
		const senderTracker = tracker;
		if (!senderTracker) return;
		const symbol = token.symbol;

		const invalidRecipients = recipients.filter(
			(r) => !r.address || !algosdk.isValidAddress(r.address)
		);
		if (invalidRecipients.length > 0) {
			error = 'Invalid recipient address(es)';
			return;
		}
		const invalidAmountIndex = recipients.findIndex((r) => {
			try {
				return decimalToBaseUnits(r.amount, token.decimals) <= 0n;
			} catch {
				return true;
			}
		});
		if (invalidAmountIndex >= 0) {
			error = `Invalid amount for recipient ${invalidAmountIndex + 1}`;
			return;
		}
		if (!withinBalance(recipients, token)) {
			error = `Total exceeds your available ${token.symbol} balance`;
			return;
		}

		flow.pin(sender);
		pinTick++;
		pendingController?.abort();
		const controller = new AbortController();
		pendingController = controller;
		const sendRecipients = recipients.map((recipient) => ({ ...recipient }));
		try {
			isSending = true;
			sentToken = token;
			txState = 'building';
			error = null;
			notice = null;
			transactionGroups = [];
			groupOutcomes = [];
			recipientsByGroup = [];
			currentTxnGroup = 0;

			if (isARC200Token(token)) {
				// Prepare transaction requests
				const txRequests = sendRecipients
					.filter((r) => r.address && r.amount)
					.map((recipient) => ({
						address: recipient.address!,
						amount: decimalToBaseUnits(recipient.amount, token.decimals),
						note: recipient.note
					}));

				// Build transactions in parallel with rate limiting
				const txResults = await processWithRateLimit(
					txRequests,
					async (req, index) => {
						return buildARC200Transaction(token, sender, req.address, req.amount, index, req.note);
					},
					5, // Process 5 at a time
					(completed, total) => {
						// Update UI with progress
						const percent = Math.round((completed / total) * 100);
						notice = `Building transactions... ${completed}/${total} (${percent}%)`;
					}
				);

				// Create optimized groups from all transactions
				const allGroups = createOptimizedGroups(
					txResults,
					sendRecipients.filter((r) => r.address && r.amount)
				);
				transactionGroups = allGroups;
			} else {
				// Handle non-ARC200 tokens (native VOI and VSA)
				const suggestedParams = await algodClient.getTransactionParams().do();
				let currentGroup: algosdk.Transaction[] = [];
				let currentRecipients: Recipient[] = [];

				for (const recipient of sendRecipients) {
					if (!recipient.address || !recipient.amount) continue;

					// Convert amount to raw units with proper decimal precision
					const rawAmount = decimalToBaseUnits(recipient.amount, token.decimals);

					let txn;
					if (isNativeToken(token)) {
						txn = await buildVOITransaction(
							token,
							sender,
							recipient.address,
							rawAmount,
							suggestedParams,
							recipient.note
						);
					} else {
						txn = await buildVSATransaction(
							token,
							sender,
							recipient.address,
							rawAmount,
							suggestedParams,
							recipient.note
						);
					}
					delete txn.group;

					if (currentGroup.length >= MAX_TXN_PER_GROUP) {
						transactionGroups.push(algosdk.assignGroupID(currentGroup));
						recipientsByGroup.push(currentRecipients);
						currentRecipients = [];
						currentGroup = [];
					}
					currentGroup.push(txn);
					currentRecipients.push(recipient);
				}

				// Add any remaining transactions as the final group
				if (currentGroup.length > 0) {
					transactionGroups.push(algosdk.assignGroupID(currentGroup));
					recipientsByGroup.push(currentRecipients);
				}
			}

			// Split groups into batches of 16 groups each for signing
			const signingBatches: algosdk.Transaction[][] = [];
			for (let i = 0; i < transactionGroups.length; i += MAX_GROUPS_PER_SIGNING) {
				const batchGroups = transactionGroups.slice(i, i + MAX_GROUPS_PER_SIGNING);
				const batchTransactions = batchGroups.flat();
				signingBatches.push(batchTransactions);
			}

			totalTxnGroups = signingBatches.length;
			let currentBatch = 0;
			const allSignedTransactions: Uint8Array[][] = [];

			// Process each batch of groups
			txState = 'awaiting';
			for (const batchTransactions of signingBatches) {
				if (controller.signal.aborted) return;
				currentTxnGroup = currentBatch;

				// Sign all transactions in this batch (up to 16 groups) at once
				const signedTransactions = await signTransactions([batchTransactions], signer);
				if (!signedTransactions) {
					throw new Error('User rejected transaction signing');
				}
				allSignedTransactions.push(signedTransactions);
				currentBatch++;
			}

			if (controller.signal.aborted) return;

			// Then send all transactions
			txState = 'sending';
			const signedGroups = allSignedTransactions.flatMap((signedBatch, batchIndex) => {
				// Split the signed transactions back into their original groups
				const groups: Uint8Array[][] = [];
				let txIndex = 0;
				const batchGroups = transactionGroups.slice(
					batchIndex * MAX_GROUPS_PER_SIGNING,
					(batchIndex + 1) * MAX_GROUPS_PER_SIGNING
				);

				for (const group of batchGroups) {
					const groupSize = group.length;
					groups.push(signedBatch.slice(txIndex, txIndex + groupSize));
					txIndex += groupSize;
				}

				return groups;
			});

			groupOutcomes = new Array(signedGroups.length).fill(undefined);
			const attemptRecipients = recipientsByGroup.map((group) =>
				group.map((recipient) => ({ address: recipient.address!, amount: recipient.amount }))
			);
			await sendGroups(signedGroups, {
				...sendDeps,
				onOutcome: createOutcomeHandler({
					tracker: senderTracker,
					record: (outcome, index) => ({
						kind: 'send',
						wallet: sender,
						txIds: outcome.txIds,
						firstTxId: outcome.firstTxId,
						lastValid: outcome.lastValid,
						recipients: attemptRecipients[index],
						symbol,
						createdAt: Date.now()
					}),
					signal: controller.signal,
					onOutcome: recordOutcome
				})
			});
			if (controller.signal.aborted) return;
			showResults = true;
			isSending = false;
			txState = 'idle';
		} catch (err) {
			if (controller.signal.aborted) return;
			console.error('Error sending tokens:', err);
			error = err instanceof Error ? err.message : 'Failed to send tokens. Please try again.';
			isSending = false;
			txState = 'idle';
		}
	}

	function resetState() {
		pendingController?.abort();
		sentToken = null;
		groupOutcomes = [];
		recipientsByGroup = [];
		txState = 'idle';
		recipients = [
			{ address: null, amount: '', note: '', info: null, isLoading: false, isValid: false }
		];
		error = null;
		notice = null;
		showResults = false;
		isSending = false;
		noteForAll = '';
		currentTxnGroup = 0;
		totalTxnGroups = 0;
		transactionGroups = [];
	}

	function clearAllRecipients() {
		recipients = [
			{ address: null, amount: '', note: '', info: null, isLoading: false, isValid: false }
		];
		error = null;
		notice = null;
	}

	// recipients is a parameter so the legacy-mode template expressions that call this
	// name it and re-run when it changes (svelte >=5.34.4; TASK-38 trail).
	function hasDuplicateRecipients(recipients: Recipient[]): boolean {
		const addresses = recipients.filter((r) => r.address).map((r) => r.address);
		return addresses.length !== new Set(addresses).size;
	}

	function combineRecipients(method: 'sum' | 'max' | 'min') {
		const combined = recipients.reduce((acc, curr) => {
			if (!curr.address) return acc;

			const existing = acc.find((r) => r.address === curr.address);
			if (existing) {
				const currentAmount = Number(curr.amount) || 0;
				const existingAmount = Number(existing.amount) || 0;

				let newAmount: number;
				switch (method) {
					case 'sum':
						newAmount = existingAmount + currentAmount;
						break;
					case 'max':
						newAmount = Math.max(existingAmount, currentAmount);
						break;
					case 'min':
						newAmount = Math.min(existingAmount, currentAmount);
						break;
				}

				existing.amount = newAmount > 0 ? enforceDecimals(newAmount, selectedToken.decimals) : '';
				return acc;
			}

			return [...acc, { ...curr }];
		}, [] as Recipient[]);

		// If we found and combined any duplicates, update the recipients
		if (combined.length < recipients.length) {
			recipients = combined;
			error = null;
			syncLookupBanner();
			notice = null;
		}
		showCombineOptions = false;
	}

	function setAmountForAllRecipients(amount: string) {
		recipients = recipients.map((recipient) => ({
			...recipient,
			amount: enforceDecimals(amount, selectedToken.decimals)
		}));
	}

	function distributeAmount(type: 'even' | 'max') {
		if (!isValidAmount) return;
		if (type === 'even' && !canSplitEvenly) return;
		if (type === 'max' && !canMaxEach) return;

		const amount = Number(amountToDistribute);
		if (type === 'even') {
			const splitAmount = enforceDecimals(amount / recipients.length, selectedToken.decimals);
			setAmountForAllRecipients(splitAmount);
		} else {
			setAmountForAllRecipients(enforceDecimals(amountToDistribute, selectedToken.decimals));
		}
		showAmountMenu = false;
		amountToDistribute = '';
	}

	function handleClose() {
		tracker?.stop();
		showCloseConfirm = false;
		if (hasCompletedTransaction) {
			onTokenSent();
		}
		resetState();
		hasCompletedTransaction = false;
		open = false;
	}

	function invalidateRows(rows: Recipient[]) {
		const work: { address: string; ticket: number }[] = [];
		const invalidatedRows = rows.map((row) => {
			const invalidated = {
				...row,
				lookupId: nextLookupId(),
				isValid: false,
				info: null,
				lookupError: null,
				isLoading: Boolean(row.address)
			};
			if (row.address) work.push({ address: row.address, ticket: invalidated.lookupId });
			return invalidated;
		});
		return { rows: invalidatedRows, work };
	}

	async function handlePasteModalConfirm(importedRecipients: Recipient[]) {
		const { rows, work } = invalidateRows(importedRecipients);
		// If we already have one empty recipient, remove it
		if (recipients.length === 1 && !recipients[0].address) {
			recipients = rows;
		} else {
			// Otherwise append new recipients up to the maximum
			const combinedRecipients = [...recipients, ...rows];
			recipients = combinedRecipients;
		}

		// Force Svelte reactivity
		recipients = [...recipients];

		error = null;
		syncLookupBanner();
		notice = null;
		await runBounded(work, 4, async ({ address, ticket }) => {
			await fetchRecipientInfo(address, ticket);
		});
	}

	// Helper function to determine if token is native VOI
	function isNativeToken(token: any): boolean {
		return token.type === 'native';
	}

	// Helper function to determine if token is ARC-200
	function isARC200Token(token: any): boolean {
		return token.type === 'arc200';
	}

	async function recheckRecipients() {
		const { rows, work } = invalidateRows(recipients);
		recipients = rows;
		await runBounded(work, 4, async ({ address, ticket }) => {
			await fetchRecipientInfo(address, ticket);
		});
	}

	function syncTokenProp(nextToken: SendToken) {
		if (isSending) return;
		const previousKey = tokenKey(selectedToken);
		selectedToken = nextToken;
		if (tokenKey(selectedToken) !== previousKey) void recheckRecipients();
	}

	function handleRetryFailedTransactions() {
		const toRetry = retryRecipients(groupOutcomes, recipientsByGroup);
		if (toRetry.length === 0) return;
		resetState();
		recipients = toRetry;
		void recheckRecipients();
	}

	function handleTokenChange(newToken: FungibleTokenType) {
		// A list left open when the send started must not switch the token mid-send.
		if (isSending) return;
		const previousKey = tokenKey(selectedToken);
		// If selecting VOI, ensure we use the latest balance
		if (isNativeToken(newToken)) {
			selectedToken = {
				type: 'native',
				symbol: 'VOI',
				decimals: 6,
				balance: nativeVoiToken.balance,
				name: 'Voi'
			};
		} else {
			selectedToken = newToken;
		}
		if (tokenKey(selectedToken) !== previousKey) void recheckRecipients();
		error = null;
		notice = null;
	}

	function setNoteForAllRecipients(noteText: string) {
		recipients = recipients.map((recipient) => ({
			...recipient,
			note: noteText
		}));
		noteForAll = '';
		showNoteMenu = false;
	}

	$: accountState = pageAccountState(accountAddress, $connectedWallets);
	$: canSignTransactions = accountState.state === 'yours';
</script>

<Modal
	bind:open
	dismissable={!closeNeedsConfirm}
	size="lg"
	on:close={handleClose}
	class="overflow-visible max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)]"
>
	{#if closeNeedsConfirm}
		<button
			type="button"
			aria-label="Close"
			class="absolute top-3 end-2.5 z-10 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-600"
			on:click={requestClose}><span aria-hidden="true" class="text-xl leading-5">×</span></button
		>
	{/if}
	{#if showCloseConfirm}
		<div
			class="rounded-lg border border-amber-300 dark:border-amber-700 p-4 mt-6 space-y-3"
			role="alert"
		>
			<p class="text-sm text-gray-900 dark:text-white">
				This send may still land on chain. It stays tracked, and you'll see it here when you reopen
				this window.
			</p>
			<div class="flex gap-3">
				<button
					type="button"
					bind:this={keepOpenButton}
					on:click={() => (showCloseConfirm = false)}
					class="rounded-lg px-4 py-2 bg-blue-700 text-white hover:bg-blue-800">Keep open</button
				>
				<button
					type="button"
					on:click={handleClose}
					class="rounded-lg px-4 py-2 bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white"
					>Close anyway</button
				>
			</div>
		</div>
	{/if}
	<div
		class="w-full sm:max-w-3xl mx-auto flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-6rem)]"
	>
		<div class="flex-none">
			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
				<div class="flex items-center gap-4">
					<h3 class="text-xl font-bold text-gray-900 dark:text-white">Send</h3>
					<div
						class="relative flex-1 sm:flex-none"
						use:clickOutside={() => (showTokenSelect = false)}
					>
						<button
							type="button"
							class="w-64 px-3 py-2 text-left bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
							disabled={isSending}
							on:click={() => {
								if (!isSending) showTokenSelect = !showTokenSelect;
							}}
						>
							{#if selectedIconId && !missingIconIds.has(selectedIconId) && !isIconMissing(selectedIconId)}
								<img
									src={isNativeToken(selectedToken)
										? 'https://asset-verification.nautilus.sh/icons/0.png'
										: iconUrl(selectedIconId)}
									on:error={() => onIconError(selectedIconId)}
									alt=""
									class="w-4 h-4 rounded-full bg-transparent"
								/>
							{/if}
							<span
								>{selectedToken.symbol} ({(
									selectedToken.balance / Math.pow(10, selectedToken.decimals)
								).toLocaleString()})</span
							>
							<i class="fas fa-chevron-down ml-auto"></i>
						</button>
						{#if showTokenSelect}
							<div
								class="absolute left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-60 overflow-y-auto"
							>
								{#each availableTokens as token, i (tokenKeys[i])}
									{@const iconId = isNativeToken(token) ? '0' : String(token.id ?? '')}
									<button
										class="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
										on:click={() => {
											handleTokenChange(token);
											showTokenSelect = false;
										}}
									>
										{#if iconId && !missingIconIds.has(iconId) && !isIconMissing(iconId)}
											<img
												src={isNativeToken(token)
													? 'https://asset-verification.nautilus.sh/icons/0.png'
													: iconUrl(iconId)}
												on:error={() => onIconError(iconId)}
												alt=""
												class="w-4 h-4 rounded-full bg-transparent"
											/>
										{/if}
										{token.symbol} ({(
											token.balance / Math.pow(10, token.decimals)
										).toLocaleString()})
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				<div
					class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 justify-between sm:justify-end w-full sm:w-auto"
				>
					{#if selectedIconId && !missingIconIds.has(selectedIconId) && !isIconMissing(selectedIconId)}
						<img
							src={isNativeToken(selectedToken)
								? 'https://asset-verification.nautilus.sh/icons/0.png'
								: iconUrl(selectedIconId)}
							on:error={() => onIconError(selectedIconId)}
							alt=""
							class="h-8 sm:h-12 rounded-full bg-transparent"
						/>
					{/if}
					<span>Available: {maxAmount.toLocaleString()} {selectedToken.symbol}</span>
				</div>
			</div>
		</div>

		{#if awaitingEntries.length > 0}
			<section
				aria-label="Awaiting confirmation"
				aria-live="polite"
				class="mb-6 space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm"
			>
				<h4 class="font-medium text-gray-900 dark:text-white">Awaiting confirmation</h4>
				{#each awaitingEntries as entry (entry.record.firstTxId)}
					<div class="space-y-2">
						<p class="text-gray-900 dark:text-white">
							{entry.status === 'pending'
								? 'Sent, awaiting confirmation'
								: entry.status === 'confirmed'
									? 'Confirmed'
									: 'Not confirmed (expired before landing)'}
						</p>
						<p class="text-gray-700 dark:text-gray-300">
							{entry.record.recipients.length} recipient{entry.record.recipients.length === 1
								? ''
								: 's'} · {parseFloat(
								entry.record.recipients
									.reduce((total, recipient) => total + Number(recipient.amount), 0)
									.toPrecision(15)
							)}
							{entry.record.symbol}
						</p>
						{#each entry.record.txIds as txId}
							<div
								class="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/50 rounded-md font-mono"
							>
								<a
									href={`https://block.voi.network/explorer/transaction/${txId}`}
									target="_blank"
									rel="noopener noreferrer"
									class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 break-all"
									title={txId}>{txId}</a
								>
								<CopyComponent
									ariaLabel="Copy transaction ID"
									text={txId}
									toastMessage="Transaction ID copied"
									failureMessage="Failed to copy transaction ID"
								/>
							</div>
						{/each}
					</div>
				{/each}
			</section>
		{/if}

		{#if pinTick && flow.address}
			<p class="text-sm text-gray-600 dark:text-gray-300">
				This transfer is from {flow.address.slice(0, 8)}...{flow.address.slice(-8)} of the account you
				started it with.
			</p>
		{/if}

		{#if !showResults}
			<div class="flex flex-col flex-1 min-h-0">
				<div class="flex-none">
					<div class="flex flex-wrap gap-2 items-center justify-between mb-6">
						<h3 class="text-lg font-medium">Recipients</h3>
						<div class="flex flex-wrap gap-2">
							<div class="relative" use:clickOutside={() => (showCombineOptions = false)}>
								<Button
									size="xs"
									color={hasDuplicateRecipients(recipients) ? 'blue' : 'light'}
									on:click={() => (showCombineOptions = !showCombineOptions)}
									disabled={recipients.length <= 1 || !hasDuplicateRecipients(recipients)}
									class={hasDuplicateRecipients(recipients) ? 'animate-pulse' : ''}
								>
									<i class="fas fa-compress-alt mr-1"></i>
									Combine
								</Button>
								{#if showCombineOptions}
									<div
										class="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
									>
										<div class="py-1">
											<button
												class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
												on:click={() => combineRecipients('sum')}
											>
												<i class="fas fa-plus-circle mr-2"></i>
												Combine Amounts
											</button>
											<button
												class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
												on:click={() => combineRecipients('max')}
											>
												<i class="fas fa-arrow-up mr-2"></i>
												Use Highest
											</button>
											<button
												class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
												on:click={() => combineRecipients('min')}
											>
												<i class="fas fa-arrow-down mr-2"></i>
												Use Lowest
											</button>
										</div>
									</div>
								{/if}
							</div>
							<Button
								size="xs"
								color="light"
								on:click={clearAllRecipients}
								disabled={recipients.length <= 1 && !recipients[0].address}
							>
								<i class="fas fa-trash-alt mr-1"></i>
								Clear
							</Button>
							<div
								class="relative"
								use:clickOutside={() => {
									showAmountMenu = false;
									amountToDistribute = '';
								}}
							>
								<Button size="xs" color="light" on:click={() => (showAmountMenu = !showAmountMenu)}>
									<i class="fas fa-coins mr-1"></i>
									Set All
								</Button>
								{#if showAmountMenu}
									<div
										class="absolute right-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
									>
										<div class="p-3 space-y-3">
											<div>
												<Label class="mb-2 text-sm">Amount to distribute:</Label>
												<Input
													type="number"
													bind:value={amountToDistribute}
													min="0"
													max={maxAmount}
													step={`${1 / Math.pow(10, selectedToken.decimals)}`}
													placeholder={`Amount in ${selectedToken.symbol}`}
													size="sm"
													on:input={(e: Event) => {
														const input = e.target as HTMLInputElement;
														amountToDistribute = enforceDecimals(
															input.value,
															selectedToken.decimals
														);
													}}
												/>
												{#if amountToDistribute && Number(amountToDistribute) > maxAmount}
													<p class="mt-1 text-xs text-red-500 dark:text-red-400">
														Amount exceeds your balance
													</p>
												{/if}
											</div>
											<div class="space-y-2">
												<Label class="text-sm">Distribution method:</Label>
												<button
													class="w-full text-left px-3 py-2 text-sm rounded flex items-center justify-between transition-colors duration-150
                                                        {canSplitEvenly
														? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
														: 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}"
													on:click={() => distributeAmount('even')}
													disabled={!canSplitEvenly}
												>
													<span class="flex items-center">
														<i class="fas fa-divide mr-2"></i>
														Split Evenly
													</span>
													<span
														class="text-xs {canSplitEvenly
															? 'text-gray-500'
															: 'text-gray-400 dark:text-gray-600'}"
													>
														{amountToDistribute && Number(amountToDistribute) > 0
															? (Number(amountToDistribute) / recipients.length).toFixed(6)
															: '0'} each
													</span>
												</button>
												<button
													class="w-full text-left px-3 py-2 text-sm rounded flex items-center justify-between transition-colors duration-150
                                                        {canMaxEach
														? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
														: 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}"
													on:click={() => distributeAmount('max')}
													disabled={!canMaxEach}
												>
													<span class="flex items-center">
														<i class="fas fa-arrow-up mr-2"></i>
														Maximum Each
													</span>
													<span
														class="text-xs {canMaxEach
															? 'text-gray-500'
															: 'text-gray-400 dark:text-gray-600'}"
													>
														{amountToDistribute || '0'} each
														{#if isValidAmount && !canMaxEach}
															<span class="block text-xs text-red-500">
																Need {totalRequiredForMax}
																{selectedToken.symbol}
															</span>
														{/if}
													</span>
												</button>
												{#if amountToDistribute && Number(amountToDistribute) > 0}
													{#if !canMaxEach && !canSplitEvenly}
														<p class="text-xs text-red-500 dark:text-red-400">
															Insufficient balance for either distribution method
														</p>
													{/if}
												{/if}
											</div>
										</div>
									</div>
								{/if}
							</div>
							<div class="relative">
								<Button
									size="xs"
									color="light"
									on:click={() => (showNoteMenu = !showNoteMenu)}
									data-set-notes-button
								>
									<i class="fas fa-sticky-note mr-1"></i>
									Set Notes
								</Button>
								{#if showNoteMenu}
									<div
										class="absolute right-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[100]"
										data-set-notes-menu
									>
										<div class="p-3 space-y-3">
											<div>
												<Label class="mb-2 text-sm">Note for all recipients:</Label>
												<Input
													type="text"
													bind:value={noteForAll}
													maxlength={1000}
													placeholder="Enter a note for all recipients"
													size="sm"
												/>
												<div class="text-xs text-right mt-1 text-gray-500 dark:text-gray-400">
													{noteForAll.length}/1000
												</div>
											</div>
											<Button
												size="xs"
												color="blue"
												class="w-full"
												on:click={() => setNoteForAllRecipients(noteForAll)}
												disabled={!noteForAll}
											>
												<i class="fas fa-check mr-1"></i>
												Apply to All Recipients
											</Button>
										</div>
									</div>
								{/if}
							</div>
							<div class="relative" use:clickOutside={() => (showImportModal = false)}>
								<Button size="xs" color="light" on:click={() => (showImportModal = true)}>
									<i class="fas fa-file-import mr-1"></i>
									Import
								</Button>
							</div>
						</div>
					</div>
				</div>

				<div class="flex-1 min-h-0 overflow-y-auto">
					<div class="space-y-6">
						<div
							class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
						>
							<!-- Header -->
							<div
								class="grid grid-cols-[minmax(200px,1fr),minmax(80px,120px)] sm:grid-cols-[minmax(280px,420px),120px] gap-4 p-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400"
							>
								<div>Recipient</div>
								<div>Amount</div>
							</div>

							<!-- Recipients -->
							<div class="divide-y divide-gray-200 dark:divide-gray-700 relative">
								{#each recipients as recipient, index}
									<RecipientRow
										bind:recipient={recipients[index]}
										{index}
										isLastRecipient={recipients.length === 1}
										{selectedToken}
										{maxAmount}
										onRemove={removeRecipient}
										onAmountChange={handleRecipientAmountChange}
										onNoteChange={handleRecipientNoteChange}
										onError={handleRecipientError}
									/>
								{/each}

								<!-- Add Recipient Button -->
								<div class="p-3 bg-gray-50 dark:bg-gray-900/50">
									<Button size="sm" color="light" on:click={addRecipient} class="w-full">
										<i class="fas fa-plus mr-1"></i>
										Add Another Recipient
									</Button>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div class="flex-none pt-4 mt-auto">
					{#if error}
						<div
							class="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm"
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<i class="fas fa-exclamation-circle"></i>
									<span>{error}</span>
								</div>
								<button
									type="button"
									class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
									on:click={() => (error = null)}
									title="Dismiss error"
									aria-label="Dismiss error"
								>
									<i class="fas fa-times"></i>
								</button>
							</div>
						</div>
					{/if}
					{#if notice}
						<div
							class="mb-4 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-lg text-sm"
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<i class="fas fa-clock"></i>
									<span>{notice}</span>
								</div>
								<button
									type="button"
									class="text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
									on:click={() => (notice = null)}
									title="Dismiss notice"
									aria-label="Dismiss notice"
								>
									<i class="fas fa-times"></i>
								</button>
							</div>
						</div>
					{/if}
					<p class="text-sm text-gray-500 dark:text-gray-400">
						Signing account: {flow.address ?? accountAddress}
					</p>

					<div
						class="flex flex-col sm:flex-row gap-3 items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700"
					>
						<div class="flex flex-col sm:flex-row items-center gap-4 text-sm w-full sm:w-auto">
							<div class="text-center sm:text-left">
								<span class="text-gray-500 dark:text-gray-400">Total Amount:</span>
								<span class="ml-1 font-medium text-gray-900 dark:text-white"
									>{totalAmount} {selectedToken.symbol}</span
								>
							</div>
							<div class="text-center sm:text-left">
								<span class="text-gray-500 dark:text-gray-400">Recipients:</span>
								<span class="ml-1 font-medium text-gray-900 dark:text-white"
									>{recipients.filter((r) => r.address && r.amount).length}</span
								>
							</div>
						</div>
						<div class="flex gap-3 w-full sm:w-auto">
							<Button color="alternative" class="flex-1 sm:flex-none" on:click={requestClose}
								>Cancel</Button
							>
							{#if canSignTransactions}<Button
									color="blue"
									class="flex-1 sm:flex-none"
									on:click={handleSend}
									disabled={!canSubmit || txState !== 'idle'}
								>
									{#if txState === 'building'}
										<svg
											class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
										>
											<circle
												class="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												stroke-width="4"
											></circle>
											<path
												class="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											></path>
										</svg>
										Building Txns...
									{:else if txState === 'awaiting'}
										<svg
											class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
										>
											<circle
												class="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												stroke-width="4"
											></circle>
											<path
												class="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											></path>
										</svg>
										Awaiting Signature {#if totalTxnGroups > 1}(Batch {currentTxnGroup + 1} of {totalTxnGroups}){/if}
									{:else if txState === 'sending'}
										<svg
											class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
										>
											<circle
												class="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												stroke-width="4"
											></circle>
											<path
												class="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											></path>
										</svg>
										Sending {#if totalTxnGroups > 1}(Batch {currentTxnGroup + 1} of {totalTxnGroups}){/if}
									{:else}
										<i class="fas fa-paper-plane mr-2"></i>
										Send
									{/if}
								</Button>{/if}
						</div>
					</div>
				</div>
			</div>
		{:else}
			<div class="space-y-6">
				<div
					class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-green-200 dark:border-green-800 p-6"
				>
					{#if statusCounts.confirmed === groupOutcomes.length}
						<div class="flex items-center justify-center mb-4">
							<div
								class="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"
							>
								<svg
									class="h-6 w-6 text-green-600 dark:text-green-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									></path>
								</svg>
							</div>
						</div>
					{/if}
					<div class="text-center" aria-live="polite">
						<h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
							{statusCounts.confirmed === groupOutcomes.length
								? 'Transaction Successful'
								: 'Transfer status'}
						</h4>
						<p class="text-green-600 dark:text-green-400 mb-4">
							Confirmed: {confirmedTotal}
							{(sentToken ?? selectedToken).symbol}
						</p>
						<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
							Groups: {statusCounts.confirmed} confirmed, {statusCounts.pending} awaiting confirmation,
							{statusCounts.expired} expired, {statusCounts.rejected} rejected
						</p>
						<div class="text-sm space-y-4 max-h-48 overflow-y-auto">
							{#each groupOutcomes as outcome, index}
								{#if outcome}
									<div>
										<p class="text-gray-900 dark:text-white mb-2">
											Group {index + 1}:
											{#if outcome.status === 'confirmed'}
												Confirmed
											{:else if outcome.status === 'pending'}
												Sent, awaiting confirmation
											{:else if outcome.status === 'expired'}
												Not confirmed (expired before landing): safe to retry
											{:else}
												Rejected: {outcome.error}
											{/if}
										</p>
										{#each outcome.txIds as txId}
											<div
												class="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/50 rounded-md font-mono"
											>
												<a
													href={`https://block.voi.network/explorer/transaction/${txId}`}
													target="_blank"
													rel="noopener noreferrer"
													class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 break-all"
													title={txId}
												>
													{outcome.status === 'pending'
														? txId
														: `${txId.slice(0, 8)}...${txId.slice(-8)}`}
												</a>
												<CopyComponent
													ariaLabel="Copy transaction ID"
													text={txId}
													toastMessage="Transaction ID copied"
													failureMessage="Failed to copy transaction ID"
												/>
											</div>
										{/each}
									</div>
								{/if}
							{/each}
						</div>
					</div>
				</div>

				<div class="flex justify-center gap-3">
					<Button color="alternative" on:click={requestClose}>Close</Button>
					{#if retryList.length > 0}
						<Button color="red" on:click={handleRetryFailedTransactions}>
							<i class="fas fa-redo mr-2"></i>
							Retry rejected or expired transactions
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</Modal>
{#if showImportModal}
	<ImportRecipientsModal
		bind:open={showImportModal}
		onClose={() => (showImportModal = false)}
		onConfirm={(recipients) => {
			handlePasteModalConfirm(recipients);
			showImportModal = false;
		}}
	/>
{/if}

<svelte:window
	on:keydown={handleCloseKeydown}
	on:click={(e) => {
		const setNotesButton = document.querySelector('[data-set-notes-button]');
		const setNotesMenu = document.querySelector('[data-set-notes-menu]');

		if (
			setNotesButton &&
			setNotesMenu &&
			!setNotesButton.contains(e.target as Node) &&
			!setNotesMenu.contains(e.target as Node) &&
			showNoteMenu
		) {
			showNoteMenu = false;
		}
	}}
/>

<style>
	:global(.overflow-visible) {
		overflow: visible !important;
	}
	:global(.overflow-visible > div) {
		overflow: visible !important;
	}
	:global(.overflow-visible > div > div) {
		overflow: visible !important;
	}
	:global(.modal) {
		width: 100%;
		max-width: min(100vw - 1rem, 48rem);
		margin: 0.5rem;
	}
	:global(.modal > div) {
		width: 100%;
		max-width: min(100vw - 1rem, 48rem);
	}
	:global(input[type='number']::-webkit-inner-spin-button),
	:global(input[type='number']::-webkit-outer-spin-button) {
		-webkit-appearance: none;
		margin: 0;
	}

	:global(input[type='number']) {
		-moz-appearance: textfield;
		appearance: textfield;
	}

	@media (max-width: 640px) {
		:global(.modal) {
			padding: 0.25rem;
			margin: 0.25rem;
		}
		:global(.modal > div) {
			padding: 0.75rem;
		}
		:global(.modal input[type='number']) {
			min-width: 0;
			width: 100%;
		}
		:global(.modal button) {
			white-space: nowrap;
		}
		:global(.flex-1.min-h-0.overflow-y-auto) {
			margin-bottom: 1rem;
		}
	}
</style>
