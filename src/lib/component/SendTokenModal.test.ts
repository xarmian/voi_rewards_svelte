import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import algosdk from 'algosdk';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import { buildAssetTransfer, buildCombinedPayment, buildPayment } from '$lib/chain/txBuilders';
import { signerMatchesAccount, wrongSignerMessage } from '$lib/chain/signerGate';
import { decimalToBaseUnits, exactBalance, sumBaseUnits } from '$lib/chain/baseUnits';
import { createFlowPin } from '$lib/chain/flowAccount';

const source = readFileSync(new URL('./SendTokenModal.svelte', import.meta.url), 'utf8');

// Vitest uses Node without a DOM renderer. Exercise the actual component functions in isolation.
function componentFunctions(names: string[], globals: Record<string, unknown>) {
	const script = names
		.map((name) => {
			const match = source.match(
				new RegExp(`\\t(?:async )?function ${name}\\([\\s\\S]*?\\n\\t\\}`)
			);
			if (!match) throw new Error(`Missing SendTokenModal function: ${name}`);
			return match[0];
		})
		.join('\n');
	const context = createContext({
		signerMatchesAccount,
		exactBalance,
		wrongSignerMessage,
		buildPayment,
		buildAssetTransfer,
		buildCombinedPayment,
		...globals
	});
	runInContext(
		ts.transpileModule(script, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	return (code: string) => runInContext(code, context);
}

// handleSend takes its signer from the selection before it validates anything, as it does when the
// user confirms, so the harness supplies both the store value and the capture.
function selectedWalletGlobals() {
	const address = algosdk.generateAccount().addr.toString();
	return {
		accountAddress: address,
		$selectedWallet: { address },
		canSignTransactions: true,
		capturePageSigner: () => ({ address, walletId: 'pera' }),
		captureSigner: () => ({ address, walletId: 'pera' }),
		flow: createFlowPin()
	};
}

// After a failed send the pin keeps the form on the submitted account while its error shows. A retry
// for another selection would sign as one account and validate against another's funds.
async function retryHarness(pinned: string, selected: string) {
	const { decimalToBaseUnits } = await import('../chain/baseUnits');
	const flow = createFlowPin();
	flow.pin(pinned);
	const run = componentFunctions(['handleSend'], {
		decimalToBaseUnits,
		algosdk,
		accountAddress: pinned,
		$selectedWallet: { address: selected },
		canSignTransactions: true,
		capturePageSigner: () => ({ address: selected, walletId: 'pera' }),
		captureSigner: () => ({ address: selected, walletId: 'pera' }),
		flow,
		selectedToken: { decimals: 6, symbol: 'VOI' },
		tracker: {},
		// An invalid second amount stops the send right after the guard, so no network is needed.
		recipients: ['1', 'abc'].map((value) => ({
			address: algosdk.generateAccount().addr.toString(),
			amount: value
		})),
		isSending: false,
		error: null
	});
	return { run, flow };
}

test('a retry after a failed send refuses an injected signer different from the pinned page', async () => {
	const pinned = algosdk.generateAccount().addr.toString();
	const other = algosdk.generateAccount().addr.toString();
	const { run, flow } = await retryHarness(pinned, other);
	await run('handleSend()');
	expect(run('error')).toBe(wrongSignerMessage());
	expect(run('isSending')).toBe(false);
	// The refusal leaves the pin where it was: the form still belongs to the submitted account.
	expect(flow.address).toBe(pinned);
	flow.dispose();
});

test('a retry after a failed send with the pinned page signer still connected goes on to validate', async () => {
	const pinned = algosdk.generateAccount().addr.toString();
	const { run, flow } = await retryHarness(pinned, pinned);
	await run('handleSend()');
	// It got past the account guard to the next check.
	expect(run('error')).toBe('Invalid amount for recipient 2');
	flow.dispose();
});

test('send conversions never use a floating point decimal scale', () => {
	expect(
		source,
		'SendTokenModal must convert typed amounts with decimalToBaseUnits, not by multiplying by Math.pow'
	).not.toMatch(/\*\s*Math\.pow\(10,\s*token\.decimals\)/);
	expect(
		source.match(/decimalToBaseUnits\(recipient\.amount, token\.decimals\)/g),
		'Both ARC-200 and native/VSA send paths must parse the original decimal string'
	).toHaveLength(2);
});

test.each(['buildVOITransaction', 'buildVSATransaction', 'buildARC200Transaction'])(
	'%s accepts bigint amounts',
	(builder) => {
		expect(source, `${builder} must declare amount: bigint to preserve exact base units`).toMatch(
			new RegExp(`function ${builder}\\([^)]*\\bamount:\\s*bigint\\b`)
		);
	}
);

test.each(['', '-1', 'abc', '1e-7', '0', '0.0000001'])(
	'rejects recipient 2 amount %j before starting a send',
	async (amount) => {
		const { decimalToBaseUnits } = await import('../chain/baseUnits');
		const run = componentFunctions(['handleSend'], {
			decimalToBaseUnits,
			algosdk,
			...selectedWalletGlobals(),
			selectedToken: { decimals: 6, symbol: 'VOI' },
			tracker: {},
			recipients: ['1', amount].map((value) => ({
				address: algosdk.generateAccount().addr.toString(),
				amount: value
			})),
			isSending: false,
			error: null
		});
		await run('handleSend()');
		expect(run('error')).toBe('Invalid amount for recipient 2');
		expect(run('isSending')).toBe(false);
	}
);

test('rejects a send whose exact base-unit total exceeds the balance even when floats round under it', async () => {
	const { decimalToBaseUnits, sumBaseUnits } = await import('../chain/baseUnits');
	// Exact total is 9007199254740994 base units; Number() sums them to 9007199254.740993.
	const run = componentFunctions(['handleSend', 'withinBalance'], {
		decimalToBaseUnits,
		sumBaseUnits,
		algosdk,
		...selectedWalletGlobals(),
		selectedToken: { decimals: 6, symbol: 'VOI', balance: 9007199254740992 },
		tracker: {},
		recipients: ['9007199254.740993', '0.000001'].map((value) => ({
			address: algosdk.generateAccount().addr.toString(),
			amount: value
		})),
		isSending: false,
		error: null
	});
	await run('handleSend()');
	expect(run('error')).toBe('Total exceeds your available VOI balance');
	expect(run('isSending')).toBe(false);
});

test('checks the exact base-unit balance when the number rounded it up past the true value', async () => {
	// True balance 9007199254740995 base units; Number() rounds it up to 9007199254740996.
	const run = componentFunctions(['handleSend', 'withinBalance'], {
		decimalToBaseUnits,
		sumBaseUnits,
		exactBalance,
		algosdk,
		...selectedWalletGlobals(),
		selectedToken: {
			decimals: 6,
			symbol: 'TEST',
			balance: 9007199254740996,
			balanceRaw: '9007199254740995'
		},
		tracker: {},
		recipients: [
			{
				address: algosdk.generateAccount().addr.toString(),
				amount: '9007199254.740996'
			}
		],
		isSending: false,
		error: null
	});
	await run('handleSend()');
	expect(run('error')).toBe('Total exceeds your available TEST balance');
});

test('accepts a send of the exact balance when the number rounded it down', () => {
	// True balance 9007199254740993 base units; Number() rounds it down to 9007199254740992.
	const run = componentFunctions(['withinBalance'], {
		decimalToBaseUnits,
		sumBaseUnits,
		exactBalance
	});
	const token = { decimals: 6, balance: 9007199254740992, balanceRaw: '9007199254740993' };
	expect(run(`withinBalance([{ amount: '9007199254.740993' }], ${JSON.stringify(token)})`)).toBe(
		true
	);
});

const suggestedParams = {
	fee: 1000,
	minFee: 1000,
	flatFee: true,
	firstValid: 1,
	lastValid: 1000,
	genesisHash: new Uint8Array(32),
	genesisID: 'test'
};

test.each(['buildVOITransaction', 'buildVSATransaction'])(
	'%s preserves bigint amounts through the installed SDK',
	async (builder) => {
		const run = componentFunctions([builder], {
			algosdk,
			sender: algosdk.generateAccount().addr.toString(),
			recipient: algosdk.generateAccount().addr.toString(),
			suggestedParams
		});
		const txn = await run(
			`${builder}({ id: '1' }, sender, recipient, 9007199254740993n, suggestedParams)`
		);
		expect(
			builder === 'buildVOITransaction' ? txn.payment?.amount : txn.assetTransfer?.amount
		).toBe(9007199254740993n);
	}
);

test('combined ARC-200 payments sum exact raw units', () => {
	const sender = algosdk.generateAccount().addr.toString();
	const recipient = algosdk.generateAccount().addr.toString();
	const payments = [9007199254740993n, 2n].map((amount) => [
		algosdk.makePaymentTxnWithSuggestedParamsFromObject({
			sender,
			receiver: recipient,
			amount,
			suggestedParams
		})
	]);
	const run = componentFunctions(['createOptimizedGroups'], {
		algosdk,
		Buffer,
		MAX_TXN_PER_GROUP: 16,
		recipientsByGroup: [],
		payments
	});
	const groups = run('createOptimizedGroups(payments, [{}, {}])');
	expect(groups[0][0].payment?.amount).toBe(9007199254740995n);
});

// Run real submit and native/VSA builders through signing with local network doubles.
test.each(['native', 'vsa'])('%s send stays with the page account', async (type) => {
	const page = algosdk.generateAccount().addr.toString();
	const other = algosdk.generateAccount().addr.toString();
	for (const accountAddress of [page, undefined]) {
		for (const selected of [other, page]) {
			const payment = vi.fn(buildPayment);
			const asset = vi.fn(buildAssetTransfer);
			const combined = vi.fn(buildCombinedPayment);
			const signTransactions = vi.fn().mockResolvedValue([new Uint8Array([1])]);
			const sendRawTransaction = vi.fn();
			const sendGroups = vi.fn().mockResolvedValue(undefined);
			const flow = createFlowPin();
			const run = componentFunctions(
				['handleSend', 'withinBalance', 'buildVOITransaction', 'buildVSATransaction'],
				{
					accountAddress,
					signerMatchesAccount,
					wrongSignerMessage,
					$selectedWallet: { address: selected },
					canSignTransactions: true,
					capturePageSigner: () => ({ address: selected, walletId: 'pera' }),
					captureSigner: () => ({ address: selected, walletId: 'pera' }),
					buildPayment: payment,
					buildAssetTransfer: asset,
					buildCombinedPayment: combined,
					signTransactions,
					sendGroups,
					algosdk,
					decimalToBaseUnits,
					sumBaseUnits,
					algodClient: {
						getTransactionParams: () => ({ do: async () => suggestedParams }),
						sendRawTransaction
					},
					flow,
					tracker: {},
					isSending: false,
					error: null,
					pinTick: 0,
					pendingController: undefined,
					AbortController,
					selectedToken: { type, id: '1', decimals: 6, symbol: 'TEST', balance: 2000000 },
					recipients: [{ address: page, amount: '1' }],
					isARC200Token: () => false,
					isNativeToken: () => type === 'native',
					MAX_TXN_PER_GROUP: 16,
					MAX_GROUPS_PER_SIGNING: 16,
					sendDeps: {},
					createOutcomeHandler: vi.fn(),
					recordOutcome: vi.fn()
				}
			);
			await run('handleSend()');
			if (selected !== accountAddress) {
				expect(run('error')).toBe(wrongSignerMessage());
				for (const call of [
					payment,
					asset,
					combined,
					signTransactions,
					sendRawTransaction,
					sendGroups
				]) {
					expect(call).not.toHaveBeenCalled();
				}
			} else {
				expect(run('error')).toBeNull();
				expect(type === 'native' ? payment : asset).toHaveBeenCalledWith(
					expect.objectContaining({ from: page })
				);
				expect(signTransactions).toHaveBeenCalledWith(
					[[(type === 'native' ? payment : asset).mock.results[0].value]],
					{ address: page, walletId: 'pera' }
				);
				expect(sendGroups).toHaveBeenCalledOnce();
				expect(run('showResults')).toBe(true);
			}
			flow.dispose();
		}
	}
});
