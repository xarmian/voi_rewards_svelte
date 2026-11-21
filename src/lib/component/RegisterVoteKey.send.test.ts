import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import * as algosdk from 'algosdk';
import {
	buildWalletKeyregTxn,
	contractKeyregCost,
	incentiveFromUri,
	incentiveKeyregFee,
	keptTickNotice,
	MIN_KEYREG_FEE,
	participateGroupTxns,
	participatePayment,
	sendWalletKeyreg,
	shortfallMessage,
	signerShortfall
} from '$lib/chain/keyreg';
import { signerMatchesAccount, wrongSignerMessage } from '$lib/chain/signerGate';
import { expect, test, vi } from 'vitest';

// Source-text pin (there is no DOM runner, TASK-124). The v2 wallet library submits and confirms
// inside signAndSendTransactions, so a failed wait arrives as a submission error. Every key
// registration send must map one that may have landed to the "check the explorer" error with the
// local transaction id, or the user retries and registers twice.
const source = readFileSync(new URL('./RegisterVoteKey.svelte', import.meta.url), 'utf8');

// The signing account's funds check every send runs before any wallet prompt; empty when absent.
const fundsHelper = source.match(/async function signerFundsError\([^]*?\n\t\}/)?.[0] ?? '';

// algod's account record for the signer, as the funds check reads it.
function fundsReader(funds: { amount: bigint; minBalance: bigint } | Error) {
	return vi.fn(() => ({
		exclude: () => ({
			do: async () => {
				if (funds instanceof Error) throw funds;
				return funds;
			}
		})
	}));
}
const ENOUGH = { amount: 100_000_000_000n, minBalance: 100_000n };
// The helpers the funds check and the staking group read use, and the Error they throw, so the
// flows' instanceof check sees it.
const fundsDeps = {
	signerShortfall,
	shortfallMessage,
	contractKeyregCost,
	participateGroupTxns,
	Error
};

test('both staking-contract flows route a failed send through keyregSendFailure with the local txid', () => {
	expect(source.match(/signAndSendTransactions\(\[txns\], signer\)/g)).toHaveLength(2);
	const guarded = source.match(
		/signAndSendTransactions\(\[txns\], signer\);\s*\} catch \(sendError\) \{[^}]*throw keyregSendFailure\(sendError, txid\);/g
	);
	expect(guarded).toHaveLength(2);
});

test('the plain-account flows send through sendWalletKeyreg, which makes the same mapping', () => {
	expect(source.match(/await sendWalletKeyreg\(/g)).toHaveLength(2);
	expect(
		source.match(/signAndSend: \(groups\) => signAndSendTransactions\(groups, signer\)/g)
	).toHaveLength(2);
	// No send path calls the library without one of the two guards.
	expect(source.match(/signAndSendTransactions\(/g)).toHaveLength(4);
});

test.each(['registerStakingContractVoteKey', 'goOfflineStakingContractVoteKey'])(
	'%s requires the parent account before participating or signing',
	async (name) => {
		const functions = ['signerOrError', name]
			.map((fn) => {
				const body = source.match(new RegExp(`(?:async )?function ${fn}\\([^]*?\\n\\t\\}`))?.[0];
				expect(body).toBeDefined();
				return body;
			})
			.concat(fundsHelper)
			.join('\n');
		for (const selected of ['X', 'Z']) {
			const participate = vi.fn().mockResolvedValue({ obj: {} });
			const custom = vi.fn().mockResolvedValue({ txns: ['txn1', 'txn2'] });
			const CONTRACT = vi.fn(function () {
				return {
					participate,
					custom,
					setFee: vi.fn(),
					setEnableGroupResourceSharing: vi.fn(),
					setExtraTxns: vi.fn()
				};
			});
			const signTransactions = vi.fn();
			const signAndSendTransactions = vi.fn().mockResolvedValue(true);
			const context = createContext({
				canSignTransactions: true,
				capturePageSigner: () => ({ address: selected }),
				captureSigner: () => ({ address: selected }),
				signerMatchesAccount,
				wrongSignerMessage,
				pageAddress: 'Z',
				walletAddress: 'CONTRACT',
				currentAccount: 'CONTRACT',
				parentWalletAddress: 'Z',
				contractId: 1,
				error: null,
				transactionStatus: 'idle',
				CONTRACT,
				abi: { custom: {} },
				algodClient: { accountInformation: fundsReader(ENOUGH) },
				...fundsDeps,
				Buffer,
				votingKey: '',
				selectionKey: '',
				stateProofKey: '',
				firstRound: 1,
				lastRound: 2,
				keyDilution: 1,
				algosdk: { decodeUnsignedTransaction: () => ({ txID: () => 'tx' }) },
				signTransactions,
				signAndSendTransactions,
				onSuccess: vi.fn(),
				participatePayment,
				MIN_KEYREG_FEE,
				payIncentiveFee: false,
				contractCanPay: false
			});
			runInContext(ts.transpileModule(functions, {}).outputText, context);
			await runInContext(`${name}()`, context);
			if (selected !== 'Z') {
				expect(context.error).toBe(wrongSignerMessage());
				for (const call of [
					CONTRACT,
					participate,
					custom,
					signTransactions,
					signAndSendTransactions
				]) {
					expect(call).not.toHaveBeenCalled();
				}
			} else {
				expect(context.error).toBeNull();
				expect(participate).toHaveBeenCalledOnce();
				expect(signAndSendTransactions).toHaveBeenCalledOnce();
				expect(signAndSendTransactions.mock.calls[0][1]).toEqual({ address: 'Z' });
				expect(context.transactionStatus).toBe('success');
				expect(context.transactionId).toBe('tx');
			}
		}
	}
);

// The participate payment becomes the contract's inner keyreg fee, so registering pays the 2 VOI
// go-online fee only when the user opted in and the contract's program is known to use it. Going
// offline always pays the minimum.
function stakingSendHarness(
	name: string,
	flags: { payIncentiveFee: boolean; contractCanPay: boolean },
	recheck: string = 'capable',
	funds: { amount: bigint; minBalance: bigint } | Error = ENOUGH
) {
	const functions = ['signerOrError', name]
		.map((fn) => source.match(new RegExp(`(?:async )?function ${fn}\\([^]*?\\n\\t\\}`))?.[0])
		.concat(fundsHelper)
		.join('\n');
	const setExtraTxns = vi.fn();
	const participate = vi.fn().mockResolvedValue({ obj: {} });
	const custom = vi.fn().mockResolvedValue({ txns: ['txn1', 'txn2'] });
	const CONTRACT = vi.fn(function () {
		return {
			participate,
			custom,
			setFee: vi.fn(),
			setEnableGroupResourceSharing: vi.fn(),
			setExtraTxns
		};
	});
	const signAndSendTransactions = vi.fn().mockResolvedValue(true);
	const contractIncentiveOf = vi.fn().mockResolvedValue(recheck);
	const accountInformation = fundsReader(funds);
	const context = createContext({
		canSignTransactions: true,
		capturePageSigner: () => ({ address: 'Z' }),
		signerMatchesAccount,
		wrongSignerMessage,
		pageAddress: 'Z',
		walletAddress: 'CONTRACT',
		currentAccount: 'CONTRACT',
		parentWalletAddress: 'Z',
		contractId: 1,
		error: null,
		transactionStatus: 'idle',
		CONTRACT,
		abi: { custom: {} },
		algodClient: { accountInformation },
		...fundsDeps,
		Buffer,
		votingKey: '',
		selectionKey: '',
		stateProofKey: '',
		firstRound: 1,
		lastRound: 2,
		keyDilution: 1,
		algosdk: { decodeUnsignedTransaction: () => ({ txID: () => 'tx' }) },
		signAndSendTransactions,
		onSuccess: vi.fn(),
		participatePayment,
		MIN_KEYREG_FEE,
		contractIncentiveOf,
		contractIncentive: flags.contractCanPay ? 'capable' : 'incapable',
		...flags
	});
	runInContext(ts.transpileModule(functions, {}).outputText, context);
	return {
		context,
		contractIncentiveOf,
		accountInformation,
		custom,
		participate,
		signAndSendTransactions,
		sends: [CONTRACT, participate, custom, setExtraTxns, signAndSendTransactions],
		setExtraTxns,
		run: () => runInContext(`${name}()`, context)
	};
}

async function extraTxnPayment(
	name: string,
	flags: { payIncentiveFee: boolean; contractCanPay: boolean }
) {
	const { context, setExtraTxns, run } = stakingSendHarness(name, flags);
	await run();
	expect(context.error).toBeNull();
	expect(setExtraTxns).toHaveBeenCalledOnce();
	const [txns] = setExtraTxns.mock.calls[0];
	expect(txns).toHaveLength(1);
	return txns[0].payment;
}

test('registering pays the 2 VOI go-online fee when opted in and the contract can pay', async () => {
	expect(
		await extraTxnPayment('registerStakingContractVoteKey', {
			payIncentiveFee: true,
			contractCanPay: true
		})
	).toBe(2_000_000);
});

test('registering pays the minimum when the contract cannot pay, even if opted in', async () => {
	expect(
		await extraTxnPayment('registerStakingContractVoteKey', {
			payIncentiveFee: true,
			contractCanPay: false
		})
	).toBe(1000);
});

test('going offline always pays the minimum', async () => {
	expect(
		await extraTxnPayment('goOfflineStakingContractVoteKey', {
			payIncentiveFee: true,
			contractCanPay: true
		})
	).toBe(1000);
});

test('only registration uses participatePayment; going offline keeps the fixed minimum', () => {
	expect(source.match(/participatePayment\(/g)).toHaveLength(2);
	expect(source).toMatch(/participatePayment\(payIncentiveFee, contractCanPay\)/);
	expect(source).toMatch(
		/const payment = participatePayment\(\s*fixed \? fixed\.payIncentiveFee : payIncentiveFee,\s*contractCanPay\s*\);[^]*?\n\t\t\t\tpayment\n\t\t\t\};/
	);
	expect(source.match(/payment: 1000/g)).toHaveLength(1);
});

// The payment is fixed at the click. A paste, or the mount-time check resolving, can turn the
// opt-in on while the group is being built; that must not send 2 VOI that skipped the fresh check.
test('turning the opt-in on during the build does not change the payment or skip the check', async () => {
	const harness = stakingSendHarness('registerStakingContractVoteKey', {
		payIncentiveFee: false,
		contractCanPay: false
	});
	harness.participate.mockImplementationOnce(async () => {
		harness.context.payIncentiveFee = true;
		harness.context.contractCanPay = true;
		harness.context.contractIncentive = 'capable';
		return { obj: {} };
	});
	await harness.run();
	expect(harness.contractIncentiveOf).not.toHaveBeenCalled();
	expect(harness.setExtraTxns.mock.calls[0][0][0].payment).toBe(1000);
});

test('both Paste buttons are disabled while a transaction is in progress', () => {
	expect(source.match(/disabled=\{isLoading \|\| transactionStatus !== 'idle'\}/g)).toHaveLength(2);
	expect(source.match(/disabled=\{isLoading\}/g)).toBeNull();
});

// The mount-time program check can be stale by submit (an upgrade, or a check that resolved
// after the box was ticked), so an opted-in registration re-reads the program and sends nothing
// unless it is still capable.
test.each(['incapable', 'unverified'])(
	'an opted-in registration sends nothing when the fresh check is %s',
	async (recheck) => {
		const harness = stakingSendHarness(
			'registerStakingContractVoteKey',
			{ payIncentiveFee: true, contractCanPay: true },
			recheck
		);
		await harness.run();
		expect(harness.contractIncentiveOf).toHaveBeenCalledOnce();
		for (const call of harness.sends) expect(call).not.toHaveBeenCalled();
		expect(harness.context.error).toMatch(/nothing was sent/);
		expect(harness.context.payIncentiveFee).toBe(false);
		// A failed read may be transient, so it leaves the option available for a rechecked retry.
		expect(harness.context.contractIncentive).toBe(
			recheck === 'incapable' ? 'incapable' : 'capable'
		);
		expect(harness.context.transactionStatus).toBe('idle');
	}
);

test('keys pasted or edited during the fresh check do not change what is registered', async () => {
	const harness = stakingSendHarness('registerStakingContractVoteKey', {
		payIncentiveFee: true,
		contractCanPay: true
	});
	Object.assign(harness.context, {
		votingKey: 'AQ==',
		selectionKey: 'Ag==',
		stateProofKey: 'Aw==',
		firstRound: '10',
		lastRound: '20',
		keyDilution: '5'
	});
	harness.contractIncentiveOf.mockImplementationOnce(async () => {
		Object.assign(harness.context, {
			votingKey: 'CQ==',
			selectionKey: 'CQ==',
			stateProofKey: 'CQ==',
			firstRound: '90',
			lastRound: '99',
			keyDilution: '9'
		});
		return 'capable';
	});
	await harness.run();
	const args = harness.participate.mock.calls[0];
	expect(
		args.map((arg: unknown) => (typeof arg === 'number' ? arg : Array.from(arg as Uint8Array)))
	).toEqual([[1], [2], 10, 20, 5, [3]]);
	expect(harness.setExtraTxns.mock.calls[0][0][0].payment).toBe(2_000_000);
});

test('Register waits for a paste in progress, so a late paste cannot swap the keys', () => {
	expect(source).toMatch(
		/async function handleSubmit\(\) \{\n\t\t\/\/[^\n]*\n\t\tif \(isLoading\) return;/
	);
	expect(source).toMatch(/disabled=\{transactionStatus !== 'idle' \|\|\s*isLoading \|\|/);
});

test('the submit button is blocked while the fresh check runs, so a second click cannot send twice', async () => {
	const harness = stakingSendHarness('registerStakingContractVoteKey', {
		payIncentiveFee: true,
		contractCanPay: true
	});
	let resolveCheck: (value: string) => void = () => {};
	harness.contractIncentiveOf.mockReturnValueOnce(
		new Promise((resolve) => {
			resolveCheck = resolve;
		})
	);
	const running = harness.run();
	await Promise.resolve();
	expect(harness.contractIncentiveOf).toHaveBeenCalledOnce();
	expect(harness.context.transactionStatus).toBe('building');
	resolveCheck('capable');
	await running;
	expect(harness.context.transactionStatus).toBe('success');
});

test('an opted-in registration re-checks the program once and pays 2 VOI when still capable', async () => {
	const harness = stakingSendHarness('registerStakingContractVoteKey', {
		payIncentiveFee: true,
		contractCanPay: true
	});
	await harness.run();
	expect(harness.contractIncentiveOf).toHaveBeenCalledOnce();
	expect(harness.context.error).toBeNull();
	expect(harness.setExtraTxns.mock.calls[0][0][0].payment).toBe(2_000_000);
});

test('a registration without the opt-in does not re-check the program and pays the minimum', async () => {
	const harness = stakingSendHarness('registerStakingContractVoteKey', {
		payIncentiveFee: false,
		contractCanPay: true
	});
	await harness.run();
	expect(harness.contractIncentiveOf).not.toHaveBeenCalled();
	expect(harness.setExtraTxns.mock.calls[0][0][0].payment).toBe(1000);
});

test('the contract pays only on a capable check, made at mount and again at submit', () => {
	expect(source).toMatch(
		/\$: contractCanPay = isStakingContract && contractIncentive === 'capable';/
	);
	expect(source.match(/contractIncentiveOf\(/g)).toHaveLength(2);
});

// A URI pasted while the mount-time check is still running must not be judged against the
// unresolved state; its fee applies once the check resolves.
function applyPasted(state: {
	contractIncentive: string;
	pastedUriFee: number | null;
	payIncentiveFee: boolean;
	isStakingContract?: boolean;
	keptByPaste?: boolean;
}) {
	const body = source.match(/function applyPastedIncentive\([^]*?\n\t\}/)?.[0];
	expect(body).toBeDefined();
	const context = createContext({
		isStakingContract: true,
		// The reactive value lags an assignment in the same tick; the function must not rely on it.
		accountCannotPay: true,
		incentiveFromUri,
		incentiveNotice: null,
		keptByPaste: false,
		...state
	});
	runInContext(ts.transpileModule(body!, {}).outputText, context);
	runInContext('applyPastedIncentive()', context);
	return context;
}

test('a fee pasted during the check waits for the check', () => {
	const context = applyPasted({
		contractIncentive: 'checking',
		pastedUriFee: 2_000_000,
		payIncentiveFee: false
	});
	expect(context.payIncentiveFee).toBe(false);
	expect(context.incentiveNotice ?? '').not.toMatch(/cannot pay|couldn't be verified/);
});

test('a pasted 2 VOI fee selects the opt-in once the contract is capable', () => {
	const context = applyPasted({
		contractIncentive: 'capable',
		pastedUriFee: 2_000_000,
		payIncentiveFee: false
	});
	expect(context.payIncentiveFee).toBe(true);
	expect(context.incentiveNotice).toBeNull();
});

test('a pasted 2 VOI fee stays off with a notice once the contract is incapable', () => {
	const context = applyPasted({
		contractIncentive: 'incapable',
		pastedUriFee: 2_000_000,
		payIncentiveFee: false
	});
	expect(context.payIncentiveFee).toBe(false);
	expect(context.incentiveNotice).toMatch(/cannot pay/);
});

test('a pasted 2 VOI fee stays off with a notice once the contract is unverified', () => {
	const context = applyPasted({
		contractIncentive: 'unverified',
		pastedUriFee: 2_000_000,
		payIncentiveFee: false
	});
	expect(context.payIncentiveFee).toBe(false);
	expect(context.incentiveNotice).toMatch(/couldn't be verified/);
});

test('a partkeyinfo paste leaves the opt-in alone', () => {
	const context = applyPasted({
		contractIncentive: 'capable',
		pastedUriFee: null,
		payIncentiveFee: true
	});
	expect(context.payIncentiveFee).toBe(true);
	expect(context.incentiveNotice).toBeNull();
});

// A URI's fee can select the opt-in but never clears a tick: a minimum-fee URI pasted after the
// user ticked "Pay 2 VOI" leaves the choice as it is.
test('a pasted minimum-fee URI keeps a ticked opt-in on a capable contract, with a notice', () => {
	const context = applyPasted({
		contractIncentive: 'capable',
		pastedUriFee: 1000,
		payIncentiveFee: true
	});
	expect(context.payIncentiveFee).toBe(true);
	expect(context.keptByPaste).toBe(true);
	expect(context.incentiveNotice).toBeNull();
	expect(keptTickNotice(context.keptByPaste, context.payIncentiveFee, false)).toMatch(
		/still selected/
	);
});

test('ticking then pasting a minimum-fee URI still sends the 2 VOI go-online fee', async () => {
	const pasted = applyPasted({
		contractIncentive: 'capable',
		pastedUriFee: 1000,
		payIncentiveFee: true
	});
	expect(pasted.payIncentiveFee).toBe(true);
	const harness = stakingSendHarness(
		'registerStakingContractVoteKey',
		{ payIncentiveFee: pasted.payIncentiveFee, contractCanPay: true },
		'capable'
	);
	await harness.run();
	expect(harness.context.error).toBeNull();
	expect(harness.setExtraTxns.mock.calls[0][0][0].payment).toBe(2_000_000);
});

// A plain account's contract check never runs, so its contractIncentive stays 'checking'.
test('a pasted minimum-fee URI keeps a ticked opt-in on a plain account, with a notice', () => {
	const context = applyPasted({
		contractIncentive: 'checking',
		pastedUriFee: 1000,
		payIncentiveFee: true,
		isStakingContract: false
	});
	expect(context.payIncentiveFee).toBe(true);
	expect(context.keptByPaste).toBe(true);
	expect(context.incentiveNotice).toBeNull();
	expect(keptTickNotice(context.keptByPaste, context.payIncentiveFee, false)).toMatch(
		/still selected/
	);
});

test('a pasted 2 VOI fee selects the opt-in on a plain account', () => {
	const context = applyPasted({
		contractIncentive: 'checking',
		pastedUriFee: 2_000_000,
		payIncentiveFee: false,
		isStakingContract: false
	});
	expect(context.payIncentiveFee).toBe(true);
	expect(context.incentiveNotice).toBeNull();
});

test('a pasted fee just under 2 VOI keeps a ticked opt-in, with a notice', () => {
	const context = applyPasted({
		contractIncentive: 'capable',
		pastedUriFee: 1_999_999,
		payIncentiveFee: true
	});
	expect(context.payIncentiveFee).toBe(true);
	expect(context.keptByPaste).toBe(true);
	expect(context.incentiveNotice).toBeNull();
	expect(keptTickNotice(context.keptByPaste, context.payIncentiveFee, false)).toMatch(
		/still selected/
	);
});

// The kept-tick notice is derived from the tick, so whatever clears the box (the user, the
// submit-time recheck, the one-click's incapable read) clears the notice with it.
test('the kept-tick notice shows only while the box is ticked against a URI asking for less', () => {
	expect(keptTickNotice(true, true, false)).toMatch(/still selected/);
	expect(keptTickNotice(true, false, false)).toBeNull();
	expect(keptTickNotice(true, true, true)).toBeNull();
	expect(keptTickNotice(false, true, false)).toBeNull();
});

test('the component derives the kept-tick notice from the live tick, only while idle, and renders it', () => {
	expect(source).toMatch(
		/\$: keptTickText =\s*transactionStatus === 'idle'\s*\?\s*keptTickNotice\(keptByPaste, payIncentiveFee, accountCannotPay\)\s*:\s*null;/
	);
	expect(source).toMatch(/\{#if keptTickText\}[^]*?\{keptTickText\}/);
});

// The usual opt-in flow: paste the node's minimum-fee URI, then tick the box on purpose. That
// tick is the user's choice, not one a paste kept, so no notice argues with it.
test('ticking after a minimum-fee paste gets no kept-tick notice', () => {
	const context = applyPasted({
		contractIncentive: 'capable',
		pastedUriFee: 1000,
		payIncentiveFee: false
	});
	expect(context.keptByPaste).toBe(false);
	expect(keptTickNotice(context.keptByPaste, true, false)).toBeNull();
});

test('changing the box by hand ends the kept-tick state', () => {
	expect(source).toMatch(
		/bind:checked=\{payIncentiveFee\}\s*on:change=\{\(\) => \(keptByPaste = false\)\}/
	);
});

test('a later 2 VOI URI or partkeyinfo paste ends the kept-tick state', () => {
	for (const pastedUriFee of [2_000_000, null]) {
		const context = applyPasted({
			contractIncentive: 'capable',
			pastedUriFee,
			payIncentiveFee: true,
			keptByPaste: true
		});
		expect(context.keptByPaste).toBe(false);
	}
});

// While a staking contract's program is being checked, a pasted 2 VOI fee is deferred, so a
// Register Key click would capture the minimum payment before the box ticks.
test('Register Key is disabled while a staking contract is being checked', () => {
	const button = source.match(/<button\s+on:click=\{handleSubmit\}[^]*?>/)?.[0];
	expect(button).toBeDefined();
	expect(button).toMatch(
		/disabled=\{[^}]*isStakingContract && contractIncentive === 'checking'[^}]*\}/
	);
});

function submitHarness(state: { isStakingContract: boolean; contractIncentive: string }) {
	const body = source.match(/async function handleSubmit\([^]*?\n\t\}/)?.[0];
	expect(body).toBeDefined();
	const registerStakingContractVoteKey = vi.fn();
	const registerWalletVoteKey = vi.fn();
	const context = createContext({
		console: { log: () => {} },
		isLoading: false,
		error: null,
		firstRound: 1,
		lastRound: 2,
		keyDilution: 1,
		selectionKey: 's',
		votingKey: 'v',
		stateProofKey: 'p',
		keyregSubmitError: () => null,
		keyregPasteAccount: null,
		currentAccount: 'CONTRACT',
		parentWalletAddress: state.isStakingContract ? 'Z' : null,
		registerStakingContractVoteKey,
		registerWalletVoteKey,
		...state
	});
	runInContext(ts.transpileModule(body!, {}).outputText, context);
	return {
		registerStakingContractVoteKey,
		registerWalletVoteKey,
		run: () => runInContext('handleSubmit()', context)
	};
}

test('handleSubmit sends nothing while a staking contract is being checked', async () => {
	const checking = submitHarness({ isStakingContract: true, contractIncentive: 'checking' });
	await checking.run();
	expect(checking.registerStakingContractVoteKey).not.toHaveBeenCalled();
	const capable = submitHarness({ isStakingContract: true, contractIncentive: 'capable' });
	await capable.run();
	expect(capable.registerStakingContractVoteKey).toHaveBeenCalledOnce();
});

test('handleSubmit still sends for a plain account, whose check stays at checking', async () => {
	const plain = submitHarness({ isStakingContract: false, contractIncentive: 'checking' });
	await plain.run();
	expect(plain.registerWalletVoteKey).toHaveBeenCalledOnce();
});

test('a pasted minimum-fee URI leaves an unticked opt-in off', () => {
	const context = applyPasted({
		contractIncentive: 'capable',
		pastedUriFee: 1000,
		payIncentiveFee: false
	});
	expect(context.payIncentiveFee).toBe(false);
	expect(context.incentiveNotice).toBeNull();
});

// A signer that can't cover the transaction plus its own minimum balance is refused before any
// wallet prompt, with the amounts, instead of failing inside the wallet or the simulate.
const SHORT = { amount: 1_000_000n, minBalance: 1_000_000n };
const READ_FAILED =
	"Couldn't read this account's balance from the network, so nothing was sent. Try again.";
const OVERSPEND =
	"The signing account doesn't hold enough VOI to cover this transaction and keep its minimum balance, so nothing was sent.";

test.each([
	['registerStakingContractVoteKey', false, 'register', contractKeyregCost(MIN_KEYREG_FEE)],
	['registerStakingContractVoteKey', true, 'register', contractKeyregCost(2_000_000)],
	['goOfflineStakingContractVoteKey', false, 'offline', contractKeyregCost(MIN_KEYREG_FEE)]
] as const)(
	'%s (opted in: %s) sends nothing when the parent account cannot pay',
	async (name, optedIn, action, cost) => {
		const harness = stakingSendHarness(
			name,
			{ payIncentiveFee: optedIn, contractCanPay: true },
			'capable',
			SHORT
		);
		await harness.run();
		expect(harness.accountInformation).toHaveBeenCalledExactlyOnceWith('Z');
		expect(harness.context.error).toBe(
			shortfallMessage(signerShortfall(SHORT, cost)!, 'Z', action)
		);
		expect(harness.context.error).toMatch(/Nothing was sent\.$/);
		for (const call of harness.sends) expect(call).not.toHaveBeenCalled();
		expect(harness.context.transactionStatus).toBe('idle');
	}
);

test('the staking registration message names the amounts', async () => {
	const harness = stakingSendHarness(
		'registerStakingContractVoteKey',
		{ payIncentiveFee: true, contractCanPay: true },
		'capable',
		SHORT
	);
	await harness.run();
	expect(harness.context.error).toBe(
		'The signing account (Z…Z) needs 3.002 VOI for this registration (2.002 VOI for the transaction plus its 1 VOI minimum balance) but holds 1 VOI. Add at least 2.002 VOI and try again. Nothing was sent.'
	);
});

test.each(['registerStakingContractVoteKey', 'goOfflineStakingContractVoteKey'])(
	'%s sends nothing when the parent account balance cannot be read',
	async (name) => {
		const harness = stakingSendHarness(
			name,
			{ payIncentiveFee: false, contractCanPay: true },
			'capable',
			new Error('algod down')
		);
		await harness.run();
		expect(harness.context.error).toBe(READ_FAILED);
		for (const call of harness.sends) expect(call).not.toHaveBeenCalled();
		expect(harness.context.transactionStatus).toBe('idle');
	}
);

test.each(['registerStakingContractVoteKey', 'goOfflineStakingContractVoteKey'])(
	'%s shows a readable error when the participate group fails to simulate',
	async (name) => {
		const harness = stakingSendHarness(name, { payIncentiveFee: false, contractCanPay: true });
		harness.custom.mockResolvedValueOnce({ success: false, error: new Error('overspend') });
		await harness.run();
		expect(harness.context.error).not.toContain("reading 'map'");
		expect(harness.context.error).toBe(OVERSPEND);
		expect(harness.signAndSendTransactions).not.toHaveBeenCalled();
		expect(harness.context.transactionStatus).toBe('idle');
	}
);

test.each(['registerStakingContractVoteKey', 'goOfflineStakingContractVoteKey'])(
	'%s builds for the contract and parent taken at the click, even if they change during the balance read',
	async (name) => {
		const harness = stakingSendHarness(name, { payIncentiveFee: false, contractCanPay: true });
		harness.accountInformation.mockImplementation(() => ({
			exclude: () => ({
				do: async () => {
					harness.context.contractId = 2;
					harness.context.parentWalletAddress = 'Y';
					return ENOUGH;
				}
			})
		}));
		await harness.run();
		expect(harness.context.error).toBeNull();
		const [CONTRACT] = harness.sends;
		expect(CONTRACT).toHaveBeenCalled();
		for (const call of CONTRACT.mock.calls) {
			expect(call[0]).toBe(1);
			expect(call.find((arg: unknown) => (arg as { addr?: unknown })?.addr)).toMatchObject({
				addr: 'Z'
			});
		}
	}
);

test('the staking flows take the participate group through participateGroupTxns', () => {
	expect(source.match(/participateGroupTxns\(customR\)\.map\(/g)).toHaveLength(2);
	expect(source).not.toMatch(/customR\.txns/);
});

const WALLET = algosdk.generateAccount().addr.toString();
const walletParams = {
	fee: 0n,
	minFee: 1000n,
	flatFee: false,
	firstValid: 5_000_000n,
	lastValid: 5_001_000n,
	genesisID: 'voimain-v1.0',
	genesisHash: new Uint8Array(32).fill(1)
};

function walletSendHarness(
	name: string,
	funds: { amount: bigint; minBalance: bigint } | Error,
	payIncentiveFee = false
) {
	const functions = ['signerOrError', name]
		.map((fn) => source.match(new RegExp(`(?:async )?function ${fn}\\([^]*?\\n\\t\\}`))?.[0])
		.concat(fundsHelper)
		.join('\n');
	const accountInformation = fundsReader(funds);
	const signAndSendTransactions = vi.fn().mockResolvedValue(true);
	const context = createContext({
		console: { log: vi.fn(), error: vi.fn() },
		canSignTransactions: true,
		capturePageSigner: () => ({ address: WALLET }),
		signerMatchesAccount,
		wrongSignerMessage,
		pageAddress: WALLET,
		walletAddress: WALLET,
		currentAccount: WALLET,
		parentWalletAddress: null,
		contractId: null,
		error: null,
		transactionStatus: 'idle',
		transactionId: null,
		algodClient: {
			accountInformation,
			getTransactionParams: () => ({ do: async () => walletParams })
		},
		algosdk: { waitForConfirmation: vi.fn().mockResolvedValue({}) },
		...fundsDeps,
		buildWalletKeyregTxn,
		sendWalletKeyreg,
		incentiveKeyregFee,
		signAndSendTransactions,
		onSuccess: vi.fn(),
		Buffer,
		votingKey: Buffer.alloc(32, 1).toString('base64'),
		selectionKey: Buffer.alloc(32, 2).toString('base64'),
		stateProofKey: Buffer.alloc(64, 3).toString('base64'),
		firstRound: '10',
		lastRound: '20',
		keyDilution: '5',
		payIncentiveFee
	});
	runInContext(ts.transpileModule(functions, {}).outputText, context);
	return {
		context,
		accountInformation,
		signAndSendTransactions,
		run: () => runInContext(`${name}()`, context) as Promise<void>
	};
}

test.each([
	['registerWalletVoteKey', false, 'register', 1000],
	['registerWalletVoteKey', true, 'register', 2_000_000],
	['goOfflineWalletVoteKey', false, 'offline', 1000]
] as const)(
	'%s (opted in: %s) sends nothing when the account cannot pay the fee plus its minimum balance',
	async (name, optedIn, action, fee) => {
		const funds = { amount: BigInt(fee) + 99_999n, minBalance: 100_000n };
		const harness = walletSendHarness(name, funds, optedIn);
		await harness.run();
		expect(harness.accountInformation).toHaveBeenCalledExactlyOnceWith(WALLET);
		expect(harness.context.error).toBe(
			shortfallMessage(signerShortfall(funds, fee)!, WALLET, action)
		);
		expect(harness.context.error).toContain('Add at least 0.000001 VOI');
		expect(harness.signAndSendTransactions).not.toHaveBeenCalled();
		expect(harness.context.transactionStatus).toBe('idle');
	}
);

test.each(['registerWalletVoteKey', 'goOfflineWalletVoteKey'])(
	'%s sends when the account holds exactly the fee plus its minimum balance',
	async (name) => {
		const harness = walletSendHarness(name, { amount: 101_000n, minBalance: 100_000n });
		await harness.run();
		expect(harness.context.error).toBeNull();
		expect(harness.signAndSendTransactions).toHaveBeenCalledOnce();
		expect(harness.context.transactionStatus).toBe('success');
	}
);

test.each(['registerWalletVoteKey', 'goOfflineWalletVoteKey'])(
	'%s sends nothing when the account balance cannot be read',
	async (name) => {
		const harness = walletSendHarness(name, new Error('algod down'));
		await harness.run();
		expect(harness.context.error).toBe(READ_FAILED);
		expect(harness.signAndSendTransactions).not.toHaveBeenCalled();
		expect(harness.context.transactionStatus).toBe('idle');
	}
);
