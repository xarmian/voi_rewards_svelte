import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { participatePayment } from '$lib/chain/keyreg';
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
async function extraTxnPayment(
	name: string,
	flags: { payIncentiveFee: boolean; contractCanPay: boolean }
) {
	const functions = ['signerOrError', name]
		.map((fn) => source.match(new RegExp(`(?:async )?function ${fn}\\([^]*?\\n\\t\\}`))?.[0])
		.join('\n');
	const setExtraTxns = vi.fn();
	const CONTRACT = vi.fn(function () {
		return {
			participate: vi.fn().mockResolvedValue({ obj: {} }),
			custom: vi.fn().mockResolvedValue({ txns: ['txn1', 'txn2'] }),
			setFee: vi.fn(),
			setEnableGroupResourceSharing: vi.fn(),
			setExtraTxns
		};
	});
	const context = createContext({
		canSignTransactions: true,
		capturePageSigner: () => ({ address: 'Z' }),
		signerMatchesAccount,
		wrongSignerMessage,
		pageAddress: 'Z',
		walletAddress: 'CONTRACT',
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
		signAndSendTransactions: vi.fn().mockResolvedValue(true),
		onSuccess: vi.fn(),
		participatePayment,
		...flags
	});
	runInContext(ts.transpileModule(functions, {}).outputText, context);
	await runInContext(`${name}()`, context);
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
	expect(source.match(/payment: participatePayment\(/g)).toHaveLength(1);
	expect(source.match(/payment: 1000/g)).toHaveLength(1);
});
