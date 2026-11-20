<script lang="ts">
	import {
		pageAccountState,
		signerMatchesAccount,
		wrongSignerMessage
	} from '$lib/chain/signerGate';
	import Modal from './ui/Modal.svelte';
	import {
		signAndSendTransactions,
		connectedWallets,
		capturePageSigner,
		type TransactionSigner
	} from '$lib/chain/wallet.svelte';
	import algosdk from 'algosdk';
	import { algodClient } from '$lib/utils/algod';
	import {
		buildWalletKeyregTxn,
		contractIncentiveOf,
		contractKeyregCost,
		type ContractIncentive,
		INCENTIVE_KEYREG_FEE,
		incentiveFromUri,
		incentiveKeyregFee,
		keyregAccount,
		keyregFee as walletKeyregFee,
		isKeyregUri,
		keyregSendFailure,
		keyregSubmitError,
		MIN_KEYREG_FEE,
		onChainKeyregOffer,
		type OnChainAccount,
		type OnChainKeyregOffer,
		type ParsedKeys,
		parseKeyregInput,
		participatePayment,
		sendWalletKeyreg
	} from '$lib/chain/keyreg';
	import {
		activeKeyregLock,
		KEYREG_LOCKED_MESSAGE,
		lockKeyreg,
		RECHECK_FAILED_MESSAGE,
		type KeyregLock
	} from '$lib/chain/keyregLock';
	import {
		BLOCK_REWARD_MAX_MICROVOI,
		BLOCK_REWARD_MIN_MICROVOI
	} from '$lib/rewards/blockRewardConstants';
	import { abi, CONTRACT } from 'ulujs';
	import VoiSwarmInstructions from './node-instructions/VoiSwarmInstructions.svelte';
	import FuncInstructions from './node-instructions/FuncInstructions.svelte';
	import OnChainEligibilityPanel from './OnChainEligibilityPanel.svelte';
	import { onMount } from 'svelte';

	$: accountState = pageAccountState(pageAddress, $connectedWallets);
	$: canSignTransactions = accountState.state === 'yours';

	export let pageAddress: string;
	export let walletAddress: string;
	export let parentWalletAddress: string | null;
	export let contractId: number | null;
	export let showModal = true;
	export let isOnline = false;
	export let onSuccess: (forceRefresh?: boolean) => void;

	type NodeType = 'voi-swarm' | 'func' | 'other';

	let selectedNode: NodeType = 'other';
	let firstRound = '';
	let lastRound = '';
	let keyDilution = '';
	let selectionKey = '';
	let votingKey = '';
	let stateProofKey = '';
	let isLoading = false;
	let error: string | null = null;
	let transactionStatus: 'idle' | 'building' | 'signing' | 'submitting' | 'confirming' | 'success' =
		'idle';
	let transactionId: string | null = null;
	// The account a URI paste was checked against (null for partkeyinfo); submit refuses a
	// URI paste if the account changed since.
	let keyregPasteAccount: string | null = null;
	$: currentAccount = keyregAccount({ walletAddress, parentWalletAddress, contractId });
	$: isStakingContract = parentWalletAddress !== null;
	// Incentive opt-in (TASK-68): pay the 2 VOI go-online fee that makes the account eligible
	// for block rewards. A staking contract can pay it only if its approval program is one known
	// to use the participate payment as the inner keyreg fee; anything else fails closed.
	let payIncentiveFee = false;
	// Staking contracts only: whether the on-chain program is known incentive capable.
	let contractIncentive: ContractIncentive = 'checking';
	$: contractCanPay = isStakingContract && contractIncentive === 'capable';
	$: accountCannotPay = isStakingContract && !contractCanPay;
	$: if (contractIncentive === 'incapable' || contractIncentive === 'unverified')
		payIncentiveFee = false;
	// The fee the last successful paste asked for: the URI's fee, or null for partkeyinfo.
	let pastedUriFee: number | null = null;
	// Shown when a pasted URI asked for the fee on an account that can't pay it.
	let incentiveNotice: string | null = null;
	// The keyreg account's record from algod and the account it was read for: read at mount and
	// replaced by each one-click fresh read. For display only: the one-click reads again at the click.
	let accountRecord: { account: string; info: OnChainAccount } | null = null;
	// Eligibility survives later keyregs and going offline, but not suspension.
	$: alreadyEligible = accountRecord?.info.incentiveEligible === true;
	const NO_OFFER: OnChainKeyregOffer = { kind: 'none' };
	$: onChainOffer = displayedOffer(
		accountRecord,
		currentAccount,
		isStakingContract,
		contractIncentive
	);
	// A keyreg that may still land (see keyregLock), as last read or set here: while it is active
	// the one-click sends nothing and the panel links it instead of the button.
	let shownLock: KeyregLock | null = null;
	const BALANCE_RANGE = { min: BLOCK_REWARD_MIN_MICROVOI, max: BLOCK_REWARD_MAX_MICROVOI };

	// The offer the panel shows: none for a record read for another account than the current one.
	function displayedOffer(
		record: { account: string; info: OnChainAccount } | null,
		account: string,
		isStakingContract: boolean,
		contractIncentive: ContractIncentive
	): OnChainKeyregOffer {
		if (record === null || record.account !== account) return NO_OFFER;
		return onChainKeyregOffer(account, record.info, {
			isStakingContract,
			contractIncentive,
			balanceRange: BALANCE_RANGE
		});
	}

	// The lock the panel shows: none for a lock on another account than the current one.
	function displayedLock(lock: KeyregLock | null, account: string): KeyregLock | null {
		return lock !== null && lock.account === account ? lock : null;
	}

	// What the one-click sends instead of the form: the keys read from chain and the 2 VOI choice.
	type FixedSend = { onChainKeys: ParsedKeys; payIncentiveFee: boolean };
	// Network minimum fee, for the cost line; 1000 until params load or if they fail.
	let minFee = MIN_KEYREG_FEE;

	onMount(async () => {
		try {
			const params = await algodClient.getTransactionParams().do();
			minFee = Number(params.minFee);
		} catch (err) {
			console.error('Error loading transaction params:', err);
		}
		if (isStakingContract) {
			contractIncentive = await contractIncentiveOf(
				async () =>
					(await algodClient.getApplicationByID(Number(contractId)).do()).params?.approvalProgram
			);
			// A URI pasted while the check ran gets its fee applied now.
			applyPastedIncentive();
		}
		await loadAccountRecord();
	});

	// The keyreg account's record for the offer, and any lock on it at the record's round. False
	// when the read failed (the record and lock shown are left as they were).
	async function loadAccountRecord() {
		try {
			// The keyreg account: the contract's application address for a staking contract.
			const account = currentAccount;
			accountRecord = {
				account,
				info: await algodClient.accountInformation(account).exclude('all').do()
			};
			shownLock = activeKeyregLock(account, accountRecord.info.round);
			return true;
		} catch (err) {
			console.error('Error loading account eligibility:', err);
			return false;
		}
	}

	// True while the lock line's Check again re-reads the account.
	let rechecking = false;

	// The lock line's Check again: re-read the record, which drops a lock past its last valid round,
	// so the button comes back without reopening the modal. Sends nothing. It replaces or clears only
	// the messages it owns (the lock refusal and its own failed read), and none once another action
	// has started, so a warning from a paste or a send is never lost.
	async function recheckLock() {
		if (transactionStatus !== 'idle' || isLoading || rechecking) return;
		rechecking = true;
		try {
			const read = await loadAccountRecord();
			const owned =
				error === null || error === KEYREG_LOCKED_MESSAGE || error === RECHECK_FAILED_MESSAGE;
			if (transactionStatus !== 'idle' || !owned) return;
			if (!read) error = RECHECK_FAILED_MESSAGE;
			else if (error === RECHECK_FAILED_MESSAGE) error = null;
			// The earlier keyreg can no longer land: the refusal about it no longer applies.
			else if (displayedLock(shownLock, currentAccount) === null) error = null;
		} finally {
			rechecking = false;
		}
	}

	const nodeInstructions = {
		'voi-swarm': {
			title: 'Voi Swarm Node',
			description: 'Easy-to-use Docker container for running a Voi node'
		},
		func: {
			title: "Funk's Ultimate Node Controller (FUNC)",
			description: 'Node with web management interface'
		},
		other: {
			title: 'Other Node',
			description: 'Manual participation key registration'
		}
	};

	async function handlePasteAll() {
		try {
			isLoading = true;
			error = null;
			const text = await navigator.clipboard.readText();
			const account = currentAccount;
			const result = parseKeyregInput(text, { account });

			if (result.ok) {
				const parsed = result.keys;
				firstRound = parsed.firstRound.toString();
				lastRound = parsed.lastRound.toString();
				keyDilution = parsed.keyDilution.toString();
				selectionKey = parsed.selectionKey;
				votingKey = parsed.votingKey;
				stateProofKey = parsed.stateProofKey;
				pastedUriFee = result.fee;
				applyPastedIncentive();
				keyregPasteAccount = isKeyregUri(text) ? account : null;

				// partkeyinfo only (a URI for another account is rejected above)
				if (parsed.parentAddress && parsed.parentAddress !== walletAddress) {
					error =
						'Warning: The address in the pasted partkeyinfo does not match the account being registered';
				}
			} else {
				error = result.error;
			}
		} catch (err) {
			error = 'Failed to read clipboard content';
			console.error(err);
		} finally {
			isLoading = false;
		}
	}

	// Applies the pasted URI's fee to the opt-in. A URI fee can select the opt-in but never
	// clears the user's choice: a minimum-fee URI, like partkeyinfo, leaves it as it is. While a
	// staking contract's program is still being checked nothing changes yet: the mount-time check
	// calls this again once it resolves.
	function applyPastedIncentive() {
		const asksForFee = pastedUriFee !== null && incentiveFromUri(pastedUriFee, false);
		if (isStakingContract && contractIncentive === 'checking') {
			incentiveNotice = asksForFee
				? 'This URI asks for the 2 VOI incentive fee. The fee choice will apply once the contract is checked.'
				: null;
			return;
		}
		// Not the reactive accountCannotPay: it lags a contractIncentive set in the same tick.
		const cannotPay = isStakingContract && contractIncentive !== 'capable';
		if (pastedUriFee !== null && incentiveFromUri(pastedUriFee, cannotPay)) {
			payIncentiveFee = true;
		}
		incentiveNotice =
			cannotPay && asksForFee
				? contractIncentive === 'unverified'
					? "This URI asks for the 2 VOI incentive fee, but this contract's version couldn't be verified to pay it. It will register with the normal fee."
					: 'This URI asks for the 2 VOI incentive fee, which this staking contract cannot pay. It will register with the normal fee.'
				: null;
	}

	async function handleSubmit() {
		// A paste still reading the clipboard would overwrite the keys mid-send.
		if (isLoading) return;
		error = null;
		console.log('Submitting participation key details');

		// check for all required fields
		if (
			!firstRound ||
			!lastRound ||
			!keyDilution ||
			!selectionKey ||
			!votingKey ||
			!stateProofKey
		) {
			error = 'Missing required fields';
			return;
		}

		const accountError = keyregSubmitError(keyregPasteAccount, currentAccount);
		if (accountError) {
			error = accountError;
			return;
		}

		// check if our wallet is a smart contract escrow account or regular account
		if (parentWalletAddress === null) {
			console.log('Account is a regular account');
			registerWalletVoteKey();
		} else {
			console.log('Account is a staking contract');
			registerStakingContractVoteKey();
		}
	}

	// The account the user confirmed, taken before any await. A failure shows in the error area.
	function signerOrError(): TransactionSigner | null {
		try {
			if (!canSignTransactions || pageAddress !== (parentWalletAddress ?? walletAddress)) {
				error = wrongSignerMessage();
				return null;
			}
			const target = pageAddress;
			const signer = capturePageSigner(target);
			if (!signerMatchesAccount(signer, target)) {
				error = wrongSignerMessage();
				return null;
			}
			return signer;
		} catch (err) {
			error = err instanceof Error ? err.message : wrongSignerMessage();
			transactionStatus = 'idle';
			return null;
		}
	}

	// fixed: what registerOnChainKeys read from chain, sent instead of the form.
	async function registerStakingContractVoteKey(fixed: FixedSend | null = null) {
		console.log('Registering staking contract vote key');
		const signer = signerOrError();
		if (!signer) return;

		if (!parentWalletAddress || !contractId) {
			error = 'Missing parent wallet address or contract ID';
			return;
		}
		if (!signerMatchesAccount(signer, parentWalletAddress)) {
			error = wrongSignerMessage();
			return;
		}
		// The keyreg account (the contract's application address), for the lock.
		const account = currentAccount;
		// Leave 'idle' before the first await, so the disabled button blocks a second submit.
		transactionStatus = 'building';
		// Fixed at the click: a paste, or the mount-time check resolving during the awaits below,
		// must not turn the 2 VOI on after the fresh check was skipped.
		const payment = participatePayment(
			fixed ? fixed.payIncentiveFee : payIncentiveFee,
			contractCanPay
		);
		// The keys on screen at the click, for the same reason: a paste or edit during the awaits
		// below must not change what is registered.
		const entered = fixed?.onChainKeys ?? {
			votingKey,
			selectionKey,
			stateProofKey,
			firstRound,
			lastRound,
			keyDilution
		};
		const keys = {
			votingKey: new Uint8Array(Buffer.from(entered.votingKey, 'base64')),
			selectionKey: new Uint8Array(Buffer.from(entered.selectionKey, 'base64')),
			firstRound: Number(entered.firstRound),
			lastRound: Number(entered.lastRound),
			keyDilution: Number(entered.keyDilution),
			stateProofKey: new Uint8Array(Buffer.from(entered.stateProofKey, 'base64'))
		};
		// The mount-time check may be stale; never send the 2 VOI without a fresh capable read.
		// (An upgrade between this read and confirmation cannot be caught from the client.)
		if (payment !== MIN_KEYREG_FEE) {
			const fresh = await contractIncentiveOf(
				async () =>
					(await algodClient.getApplicationByID(Number(contractId)).do()).params?.approvalProgram
			);
			if (fresh !== 'capable') {
				// A failed read may be transient: keep the option available so a retry rechecks.
				if (fresh === 'incapable') contractIncentive = fresh;
				// The one-click leaves the form alone.
				if (!fixed) payIncentiveFee = false;
				// The one-click does not use the form's fee option, so its message does not point there;
				// an incapable contract loses the offer, so only an unverified read invites a retry.
				error = !fixed
					? "This contract's version could not be confirmed to pay the incentive fee, so nothing was sent. Review the fee option and try again."
					: fresh === 'incapable'
						? "This contract's version can't pay the incentive fee, so nothing was sent."
						: "This contract's version could not be confirmed to pay the incentive fee, so nothing was sent. Try again.";
				transactionStatus = 'idle';
				return;
			}
		}

		// The participate app call, once built: its last valid round ends the lock.
		let sent: algosdk.Transaction | null = null;
		try {
			const ctcInfo = Number(contractId);

			const schema = {
				name: 'Participate',
				desc: 'Participate in the staking contract',
				methods: [
					{
						name: 'participate',
						desc: '',
						args: [
							{ name: 'votekey', type: 'byte[32]' },
							{ name: 'selkey', type: 'byte[32]' },
							{ name: 'votefst', type: 'uint64' },
							{ name: 'votelst', type: 'uint64' },
							{ name: 'votekd', type: 'uint64' },
							{ name: 'spkey', type: 'byte[64]' }
						],
						returns: { type: 'void' }
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
						addr: parentWalletAddress,
						sk: new Uint8Array(0)
					},
					true,
					false,
					true
				)
			};

			const ci = new CONTRACT(ctcInfo, algodClient, null, abi.custom, {
				addr: parentWalletAddress,
				sk: new Uint8Array(0)
			});

			const txnO = {
				...(
					await builder.wnt.participate(
						keys.votingKey,
						keys.selectionKey,
						keys.firstRound,
						keys.lastRound,
						keys.keyDilution,
						keys.stateProofKey
					)
				).obj,
				payment
			};

			ci.setFee(1000);
			ci.setEnableGroupResourceSharing(true);
			ci.setExtraTxns([txnO]);
			const customR = await ci.custom();

			transactionStatus = 'signing';
			const txns: algosdk.Transaction[] = customR.txns.map((txn: string) =>
				algosdk.decodeUnsignedTransaction(new Uint8Array(Buffer.from(txn, 'base64')))
			);

			const txid = txns[1].txID();
			sent = txns[1];

			transactionStatus = 'submitting';

			let result;
			try {
				result = await signAndSendTransactions([txns], signer);
			} catch (sendError) {
				// The library confirms inside the call: a wait that failed may still have landed.
				throw keyregSendFailure(sendError, txid);
			}
			if (result) {
				transactionStatus = 'success';
				transactionId = txid;
				onSuccess?.(true);
			} else {
				// No result says neither that it was sent nor that it wasn't: it may land.
				shownLock = lockKeyreg(account, txid, sent.lastValid);
				error = 'Failed to register vote key';
				transactionStatus = 'idle';
			}
		} catch (err) {
			console.error('Error registering vote key:', err);
			error = err instanceof Error ? err.message : 'Failed to register vote key';
			// Sent but not confirmed: it may land. By name: the harnesses run this without imports.
			if ((err as { name?: unknown } | null)?.name === 'KeyregUnconfirmedError' && sent) {
				shownLock = lockKeyreg(account, sent.txID(), sent.lastValid);
			}
			transactionStatus = 'idle';
		}
	}

	// fixed: what registerOnChainKeys read from chain, sent instead of the form.
	async function registerWalletVoteKey(fixed: FixedSend | null = null) {
		const signer = signerOrError();
		if (!signer) return;
		let sent: algosdk.Transaction | null = null;
		try {
			transactionStatus = 'building';
			// The keys and fee at the click: an edit during the await below must not change them.
			const keys = fixed?.onChainKeys ?? {
				votingKey,
				selectionKey,
				stateProofKey,
				firstRound: Number(firstRound),
				lastRound: Number(lastRound),
				keyDilution: Number(keyDilution)
			};
			const fee = incentiveKeyregFee(fixed ? fixed.payIncentiveFee : payIncentiveFee);
			const params = await algodClient.getTransactionParams().do();

			const tx = buildWalletKeyregTxn({
				params,
				sender: walletAddress,
				votingKey: keys.votingKey,
				selectionKey: keys.selectionKey,
				stateProofKey: keys.stateProofKey,
				firstRound: keys.firstRound,
				lastRound: keys.lastRound,
				keyDilution: keys.keyDilution,
				fee
			});
			sent = tx;

			transactionStatus = 'signing';
			const txid = await sendWalletKeyreg(tx, {
				signAndSend: (groups) => signAndSendTransactions(groups, signer),
				waitForConfirmation: (id) => algosdk.waitForConfirmation(algodClient, id, 4),
				onSubmitted: (id) => {
					transactionId = id;
					transactionStatus = 'confirming';
				}
			});
			transactionId = txid;
			transactionStatus = 'success';
			onSuccess?.(true);
		} catch (err) {
			console.error('Error registering vote key:', err);
			error = err instanceof Error ? err.message : 'Failed to register vote key';
			// Sent but not confirmed: it may land. By name: the harnesses run this without imports.
			if ((err as { name?: unknown } | null)?.name === 'KeyregUnconfirmedError' && sent) {
				shownLock = lockKeyreg(sent.sender.toString(), sent.txID(), sent.lastValid);
			}
			transactionStatus = 'idle';
		}
	}

	// One click for an account online without the incentive fee: re-register the keys on chain,
	// read fresh now (never the mount record), with the 2 VOI fee. Same keys, so no offline gap.
	async function registerOnChainKeys() {
		if (transactionStatus !== 'idle' || isLoading) return;
		error = null;
		if (!canSignTransactions || pageAddress !== (parentWalletAddress ?? walletAddress)) {
			error = wrongSignerMessage();
			return;
		}
		// Leave 'idle' before the first await, so a second click cannot start a second registration.
		transactionStatus = 'building';
		const account = currentAccount;
		let offer: OnChainKeyregOffer;
		let lock: KeyregLock | null;
		try {
			const info = await algodClient.accountInformation(account).exclude('all').do();
			// The panel shows the fresh record: it hides when this is no longer an offer.
			accountRecord = { account, info };
			lock = activeKeyregLock(account, info.round);
			shownLock = lock;
			offer = onChainKeyregOffer(account, info, {
				isStakingContract,
				contractIncentive,
				balanceRange: BALANCE_RANGE
			});
		} catch (err) {
			console.error('Error reading the account registration:', err);
			error =
				"Couldn't read this account's registration from the network, so nothing was sent. Try again.";
			transactionStatus = 'idle';
			return;
		}
		// An earlier keyreg for this account may still land: a second could register twice.
		if (lock !== null) {
			error = KEYREG_LOCKED_MESSAGE;
			transactionStatus = 'idle';
			return;
		}
		// contractCanPay decides the participate payment, so it must agree with the offer.
		if (
			offer.kind !== 'offer' ||
			account !== currentAccount ||
			(isStakingContract && !contractCanPay)
		) {
			error =
				'These keys can no longer be made eligible (the account may already be eligible, be offline, or its keys may have expired or changed), so nothing was sent.';
			transactionStatus = 'idle';
			return;
		}
		// The form is left as it is: everything sent comes from here.
		const fixed: FixedSend = { onChainKeys: offer.keys, payIncentiveFee: true };
		if (parentWalletAddress === null) await registerWalletVoteKey(fixed);
		else await registerStakingContractVoteKey(fixed);
		// A registration refused before it started building (the signer checks) leaves 'building'.
		if (transactionStatus === 'building') transactionStatus = 'idle';
	}

	async function goOfflineWalletVoteKey() {
		error = null;
		const signer = signerOrError();
		if (!signer) return;
		let sent: algosdk.Transaction | null = null;
		try {
			transactionStatus = 'building';
			const params = await algodClient.getTransactionParams().do();

			// Going offline is a key registration with no keys (never nonParticipation; see TASK-78)
			const tx = buildWalletKeyregTxn({ params, sender: walletAddress, offline: true });
			sent = tx;

			transactionStatus = 'signing';
			const txid = await sendWalletKeyreg(tx, {
				signAndSend: (groups) => signAndSendTransactions(groups, signer),
				waitForConfirmation: (id) => algosdk.waitForConfirmation(algodClient, id, 4),
				onSubmitted: (id) => {
					transactionId = id;
					transactionStatus = 'confirming';
				}
			});
			transactionId = txid;
			transactionStatus = 'success';
			onSuccess?.(true);
		} catch (err) {
			console.error('Error going offline:', err);
			error = err instanceof Error ? err.message : 'Failed to go offline';
			// Sent but not confirmed: it may land. By name: the harnesses run this without imports.
			if ((err as { name?: unknown } | null)?.name === 'KeyregUnconfirmedError' && sent) {
				shownLock = lockKeyreg(sent.sender.toString(), sent.txID(), sent.lastValid);
			}
			transactionStatus = 'idle';
		}
	}

	async function goOfflineStakingContractVoteKey() {
		error = null;
		console.log('Going offline for staking contract');
		const signer = signerOrError();
		if (!signer) return;

		if (!parentWalletAddress || !contractId) {
			error = 'Missing parent wallet address or contract ID';
			return;
		}
		if (!signerMatchesAccount(signer, parentWalletAddress)) {
			error = wrongSignerMessage();
			return;
		}
		// The keyreg account (the contract's application address), for the lock.
		const account = currentAccount;

		// The participate app call, once built: its last valid round ends the lock.
		let sent: algosdk.Transaction | null = null;
		try {
			transactionStatus = 'building';
			const ctcInfo = Number(contractId);

			const schema = {
				name: 'Participate',
				desc: 'Participate in the staking contract',
				methods: [
					{
						name: 'participate',
						desc: '',
						args: [
							{ name: 'votekey', type: 'byte[32]' },
							{ name: 'selkey', type: 'byte[32]' },
							{ name: 'votefst', type: 'uint64' },
							{ name: 'votelst', type: 'uint64' },
							{ name: 'votekd', type: 'uint64' },
							{ name: 'spkey', type: 'byte[64]' }
						],
						returns: { type: 'void' }
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
						addr: parentWalletAddress,
						sk: new Uint8Array(0)
					},
					true,
					false,
					true
				)
			};

			const ci = new CONTRACT(ctcInfo, algodClient, null, abi.custom, {
				addr: parentWalletAddress,
				sk: new Uint8Array(0)
			});

			const txnO = {
				...(
					await builder.wnt.participate(
						new Uint8Array(32), // Empty voting key
						new Uint8Array(32), // Empty selection key
						0, // First round
						0, // Last round
						0, // Key dilution
						new Uint8Array(64) // Empty state proof key
					)
				).obj,
				payment: 1000
			};

			ci.setFee(1000);
			ci.setEnableGroupResourceSharing(true);
			ci.setExtraTxns([txnO]);
			const customR = await ci.custom();

			transactionStatus = 'signing';
			const txns: algosdk.Transaction[] = customR.txns.map((txn: string) =>
				algosdk.decodeUnsignedTransaction(new Uint8Array(Buffer.from(txn, 'base64')))
			);

			const txid = txns[1].txID();
			sent = txns[1];

			transactionStatus = 'submitting';

			let result;
			try {
				result = await signAndSendTransactions([txns], signer);
			} catch (sendError) {
				// The library confirms inside the call: a wait that failed may still have landed.
				throw keyregSendFailure(sendError, txid);
			}
			if (result) {
				transactionStatus = 'success';
				transactionId = txid;
				onSuccess?.(true);
			} else {
				// No result says neither that it was sent nor that it wasn't: it may land.
				shownLock = lockKeyreg(account, txid, sent.lastValid);
				error = 'Failed to go offline';
				transactionStatus = 'idle';
			}
		} catch (err) {
			console.error('Error going offline:', err);
			error = err instanceof Error ? err.message : 'Failed to go offline';
			// Sent but not confirmed: it may land. By name: the harnesses run this without imports.
			if ((err as { name?: unknown } | null)?.name === 'KeyregUnconfirmedError' && sent) {
				shownLock = lockKeyreg(account, sent.txID(), sent.lastValid);
			}
			transactionStatus = 'idle';
		}
	}

	function formatWalletAddress(address: string): string {
		if (address.length <= 8) return address;
		return `${address.slice(0, 4)}...${address.slice(-4)}`;
	}

	function sanitizeNumberInput(event, setter) {
		const cleaned = event.target.value.replace(/,/g, '');
		setter(cleaned);
	}
</script>

<Modal bind:showModal size="xl" labelledby="register-participation-key-title">
	<div slot="header" class="flex items-center justify-between w-full">
		<div class="flex items-center gap-2">
			<i class="fas fa-key text-blue-500"></i>
			<span
				id="register-participation-key-title"
				class="text-lg font-semibold text-gray-900 dark:text-white">Register Participation Key</span
			>
		</div>
		<div class="flex items-center gap-2">
			<button
				on:click={handlePasteAll}
				class="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors flex items-center gap-2"
				disabled={isLoading || transactionStatus !== 'idle'}
			>
				{#if isLoading}
					<i class="fas fa-spinner fa-spin"></i>
				{:else}
					<i class="fas fa-clipboard"></i>
				{/if}
				<span>Paste All from Clipboard</span>
			</button>
			<div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
				<i class="fas fa-wallet"></i>
				<span class="hidden sm:inline">Wallet:</span>
				<span class="font-mono">{formatWalletAddress(walletAddress)}</span>
			</div>
		</div>
	</div>

	{#if error}
		<div
			class="mb-6 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md text-sm flex items-center gap-2"
		>
			<i class="fas fa-exclamation-triangle"></i>
			<span>{error}</span>
		</div>
	{/if}

	{#if onChainOffer.kind === 'offer' && transactionStatus !== 'success'}
		<OnChainEligibilityPanel
			offer={onChainOffer}
			cost={isStakingContract
				? contractKeyregCost(INCENTIVE_KEYREG_FEE) / 1e6
				: walletKeyregFee(INCENTIVE_KEYREG_FEE, minFee) / 1e6}
			canRegister={canSignTransactions && pageAddress === (parentWalletAddress ?? walletAddress)}
			disabled={transactionStatus !== 'idle' || isLoading}
			onRegister={registerOnChainKeys}
			unconfirmed={displayedLock(shownLock, currentAccount)}
			onRecheck={recheckLock}
			{rechecking}
		/>
	{/if}

	<div class="space-y-8">
		<!-- Node Selection and Instructions -->
		<div class="space-y-6">
			<div class="border-t border-gray-200 dark:border-gray-700 pt-6">
				<h3 class="text-base font-medium text-gray-900 dark:text-white mb-4">
					Need help generating keys? Choose your node type:
				</h3>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{#each Object.entries(nodeInstructions) as [type, info]}
						<button
							class="p-4 rounded-lg border-2 text-left transition-all {selectedNode === type
								? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/20'
								: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
							on:click={() => (selectedNode = type as NodeType)}
						>
							<h3 class="font-medium text-gray-900 dark:text-white">{info.title}</h3>
							<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{info.description}</p>
						</button>
					{/each}
				</div>
			</div>

			{#if selectedNode === 'voi-swarm'}
				<VoiSwarmInstructions {walletAddress} />
			{:else if selectedNode === 'func'}
				<FuncInstructions {walletAddress} />
			{/if}
		</div>

		<!-- Registration Form Panel -->
		<div class="space-y-6">
			<div
				class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md"
			>
				<i class="fas fa-info-circle text-blue-500"></i>
				<span
					>After generating your participation keys using the instructions, enter them below, or use
					Paste All with either <code>goal account partkeyinfo</code> output or a keyreg URI (voi://…).</span
				>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div class="relative">
					<label
						for="firstRound"
						class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
					>
						First Round
						<span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
					</label>
					<div class="relative">
						<i
							class="fas fa-hashtag absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
						></i>
						<input
							type="text"
							id="firstRound"
							bind:value={firstRound}
							on:input={(e) => sanitizeNumberInput(e, (val) => (firstRound = val))}
							class="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
							placeholder="Enter first round"
						/>
					</div>
				</div>
				<div class="relative">
					<label
						for="lastRound"
						class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
					>
						Last Round
						<span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
					</label>
					<div class="relative">
						<i
							class="fas fa-hashtag absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
						></i>
						<input
							type="text"
							id="lastRound"
							bind:value={lastRound}
							on:input={(e) => sanitizeNumberInput(e, (val) => (lastRound = val))}
							class="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
							placeholder="Enter last round"
						/>
					</div>
				</div>
			</div>

			<div class="relative">
				<label
					for="keyDilution"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
				>
					Key Dilution
					<span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
				</label>
				<div class="relative">
					<i
						class="fas fa-key absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
					></i>
					<input
						type="text"
						id="keyDilution"
						bind:value={keyDilution}
						on:input={(e) => sanitizeNumberInput(e, (val) => (keyDilution = val))}
						class="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
						placeholder="Enter key dilution"
					/>
				</div>
			</div>

			<div>
				<label
					for="selectionKey"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
				>
					Selection Key
					<span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
				</label>
				<div class="relative">
					<input
						id="selectionKey"
						bind:value={selectionKey}
						class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 font-mono text-sm transition-colors"
						placeholder="Paste selection key"
					/>
				</div>
			</div>

			<div>
				<label
					for="votingKey"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
				>
					Voting Key
					<span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
				</label>
				<div class="relative">
					<input
						id="votingKey"
						bind:value={votingKey}
						class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 font-mono text-sm transition-colors"
						placeholder="Paste voting key"
					/>
				</div>
			</div>

			<div>
				<label
					for="stateProofKey"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
				>
					State Proof Key
					<span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
				</label>
				<div class="relative">
					<input
						id="stateProofKey"
						bind:value={stateProofKey}
						class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 font-mono text-sm transition-colors"
						placeholder="Paste state proof key"
					/>
				</div>
			</div>

			<div class="flex justify-end">
				<button
					on:click={handlePasteAll}
					class="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors flex items-center gap-2"
					disabled={isLoading || transactionStatus !== 'idle'}
				>
					{#if isLoading}
						<i class="fas fa-spinner fa-spin"></i>
					{:else}
						<i class="fas fa-clipboard"></i>
					{/if}
					<span>Paste All from Clipboard</span>
				</button>
			</div>

			<div
				class="p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
			>
				<label
					class="flex items-start gap-3 {accountCannotPay
						? 'cursor-not-allowed opacity-60'
						: 'cursor-pointer'}"
				>
					<input
						type="checkbox"
						bind:checked={payIncentiveFee}
						disabled={accountCannotPay || transactionStatus !== 'idle'}
						aria-describedby="incentive-fee-help"
						class="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
					/>
					<span class="text-sm font-medium text-gray-900 dark:text-gray-100">
						Pay 2 VOI to become eligible for real-time block rewards (incentive eligible)
					</span>
				</label>
				<p id="incentive-fee-help" class="mt-1 ml-7 text-xs text-gray-600 dark:text-gray-400">
					{#if isStakingContract && contractIncentive === 'checking'}
						Checking whether this contract can pay the incentive fee…
					{:else if isStakingContract && contractIncentive === 'unverified'}
						Couldn't verify this contract's version, so it registers keys with the normal 0.001 VOI
						fee.
					{:else if isStakingContract && !contractCanPay}
						Not available for this staking contract: this contract's version registers keys with the
						normal 0.001 VOI fee.
					{:else}
						{#if isStakingContract}
							The fee is paid from your wallet to the contract for its key registration, once, and
							is not refundable. Off means the normal 0.001 VOI fee.
						{:else}
							The fee is paid once, at key registration, and is not refundable. Off means the normal
							0.001 VOI fee.
						{/if}
						{#if alreadyEligible}
							This account is already incentive eligible, so you don't need to pay it again.
						{/if}
					{/if}
				</p>
				{#if incentiveNotice}
					<p class="mt-1 ml-7 text-xs text-amber-700 dark:text-amber-300">{incentiveNotice}</p>
				{/if}
			</div>
		</div>
	</div>

	<div slot="footer" class="flex flex-col gap-4">
		{#if error}
			<div
				class="p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md text-sm flex items-center gap-2"
			>
				<i class="fas fa-exclamation-triangle"></i>
				<span>{error}</span>
			</div>
		{/if}

		{#if transactionStatus !== 'idle'}
			<div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
				<div class="flex items-center gap-2 text-sm">
					{#if transactionStatus === 'building'}
						<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
						<span class="text-blue-700 dark:text-blue-300">Building transaction...</span>
					{:else if transactionStatus === 'signing'}
						<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
						<span class="text-blue-700 dark:text-blue-300">Waiting for signature...</span>
					{:else if transactionStatus === 'submitting'}
						<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
						<span class="text-blue-700 dark:text-blue-300">Submitting transaction...</span>
					{:else if transactionStatus === 'confirming'}
						<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
						<span class="text-blue-700 dark:text-blue-300">Confirming transaction...</span>
					{:else if transactionStatus === 'success'}
						<i class="fas fa-check text-green-500"></i>
						<span class="text-green-700 dark:text-green-300">Transaction successful!</span>
						{#if transactionId}
							<a
								href={`https://block.voi.network/explorer/transaction/${transactionId}`}
								class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 ml-2"
								target="_blank"
								rel="noopener noreferrer"
							>
								View in Explorer
							</a>
						{/if}
					{/if}
				</div>
			</div>
		{/if}

		<div class="flex justify-between">
			<div
				class="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md"
			>
				<div class="flex items-center gap-2">
					<i class="fas fa-info-circle"></i>
					<span
						>Transaction Cost: {parentWalletAddress
							? contractKeyregCost(participatePayment(payIncentiveFee, contractCanPay)) / 1e6
							: walletKeyregFee(incentiveKeyregFee(payIncentiveFee), minFee) / 1e6} VOI</span
					>
				</div>
			</div>

			<div class="flex flex-col-reverse sm:flex-row justify-end gap-3">
				<button
					on:click={() => (showModal = false)}
					class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors flex items-center justify-center gap-2"
					disabled={transactionStatus !== 'idle' && transactionStatus !== 'success'}
				>
					<i class="fas fa-times"></i>
					{#if transactionStatus === 'success'}
						<span>Close</span>
					{:else}
						<span>Cancel</span>
					{/if}
				</button>
				{#if canSignTransactions && pageAddress === (parentWalletAddress ?? walletAddress)}<button
						on:click={handleSubmit}
						class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
						disabled={transactionStatus !== 'idle' ||
							isLoading ||
							!firstRound ||
							!lastRound ||
							!keyDilution ||
							!selectionKey ||
							!votingKey ||
							!stateProofKey}
					>
						<i class="fas fa-check"></i>
						<span>Register Key</span>
					</button>
					{#if isOnline}
						<button
							on:click={() => {
								if (parentWalletAddress === null) {
									goOfflineWalletVoteKey();
								} else {
									goOfflineStakingContractVoteKey();
								}
							}}
							class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
							disabled={transactionStatus !== 'idle' && transactionStatus !== 'success'}
						>
							<i class="fas fa-power-off"></i>
							<span>Go Offline</span>
						</button>
					{/if}{/if}
			</div>
		</div>
	</div>
</Modal>
