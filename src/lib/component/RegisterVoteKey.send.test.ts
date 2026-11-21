import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { incentiveFromUri, MIN_KEYREG_FEE, participatePayment } from '$lib/chain/keyreg';
import { signerMatchesAccount, wrongSignerMessage } from '$lib/chain/signerGate';
import { expect, test, vi } from 'vitest';

// Source-text pin (there is no DOM runner, TASK-124). The v2 wallet library submits and confirms
// inside signAndSendTransactions, so a failed wait arrives as a submission error. Every key
// registration send must map one that may have landed to the "check the explorer" error with the
// local transaction id, or the user retries and registers twice.
const source = readFileSync(new URL('./RegisterVoteKey.svelte', import.meta.url), 'utf8');

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
				algodClient: {},
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
	recheck: string = 'capable'
) {
	const functions = ['signerOrError', name]
		.map((fn) => source.match(new RegExp(`(?:async )?function ${fn}\\([^]*?\\n\\t\\}`))?.[0])
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
		algodClient: {},
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
		participate,
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
		// A kept-tick notice from an earlier paste describes a tick this check clears.
		harness.context.incentiveNotice = 'The 2 VOI incentive option is still selected.';
		await harness.run();
		expect(harness.contractIncentiveOf).toHaveBeenCalledOnce();
		for (const call of harness.sends) expect(call).not.toHaveBeenCalled();
		expect(harness.context.error).toMatch(/nothing was sent/);
		expect(harness.context.payIncentiveFee).toBe(false);
		expect(harness.context.incentiveNotice).toBeNull();
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
}) {
	const body = source.match(/function applyPastedIncentive\([^]*?\n\t\}/)?.[0];
	expect(body).toBeDefined();
	const context = createContext({
		isStakingContract: true,
		// The reactive value lags an assignment in the same tick; the function must not rely on it.
		accountCannotPay: true,
		incentiveFromUri,
		incentiveNotice: null,
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
	expect(context.incentiveNotice).toMatch(/still selected/);
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
	expect(context.incentiveNotice).toMatch(/still selected/);
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
	expect(context.incentiveNotice).toMatch(/still selected/);
});

test('changing the opt-in clears the paste notice', () => {
	expect(source).toMatch(
		/bind:checked=\{payIncentiveFee\}\s*on:change=\{\(\) => \(incentiveNotice = null\)\}/
	);
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
