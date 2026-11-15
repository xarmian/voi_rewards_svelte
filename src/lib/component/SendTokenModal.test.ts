import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import algosdk from 'algosdk';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import { buildAssetTransfer, buildCombinedPayment, buildPayment } from '$lib/chain/txBuilders';
import { signerMatchesAccount, wrongSignerMessage } from '$lib/chain/signerGate';
import { decimalToBaseUnits, exactBalance, sumBaseUnits } from '$lib/chain/baseUnits';
import * as sendAmounts from '$lib/chain/sendAmounts';
import { createFlowPin } from '$lib/chain/flowAccount';
import { tokenKey } from '$lib/chain/recipientInfo';

const source = readFileSync(new URL('./SendTokenModal.svelte', import.meta.url), 'utf8');

// Vitest uses Node without a DOM renderer. Exercise the actual component functions in isolation.
function componentFunctions(names: string[], globals: Record<string, unknown>) {
	const script = [...new Set([...names, 'getExactBalance', 'getSpendableBalance', 'isNativeToken'])]
		.map((name) => {
			const match = source.match(
				new RegExp(`\\t(?:async )?function ${name}\\([\\s\\S]*?\\n\\t\\}`)
			);
			if (!match) throw new Error(`Missing SendTokenModal function: ${name}`);
			return match[0];
		})
		.join('\n');
	const context = createContext({
		...sendAmounts,
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
		selectedToken: { type: 'native', decimals: 6, symbol: 'VOI', balance: 9007199254740992 },
		tracker: {},
		recipients: ['9007199254.740993', '0.000001'].map((value) => ({
			address: algosdk.generateAccount().addr.toString(),
			amount: value
		})),
		isSending: false,
		error: null
	});
	await run('handleSend()');
	expect(run('error')).toBe('Total plus network fees exceeds your available VOI balance');
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
					requireAccountInfo: vi.fn().mockResolvedValue({ amount: 2000000n, minBalance: 100000n }),
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

// Read the actual reactive assignments as well as event handlers, so display and send agree.
async function amountHarness(
	amounts: string[],
	decimals: number,
	balance: number,
	balanceRaw?: string,
	native = false,
	minBalanceRaw?: string
) {
	const helpers = await import('../chain/sendAmounts');
	const names = [
		'enforceDecimals',
		'withinBalance',
		'setAmountForAllRecipients',
		'distributeAmount',
		'getExactBalance',
		'formatMaxAmount',
		'displayTotal'
	];
	const run = componentFunctions(
		names.filter((name) => source.includes(`function ${name}(`)),
		{
			...helpers,
			decimalToBaseUnits,
			exactBalance,
			sumBaseUnits,
			selectedToken: {
				decimals,
				balance,
				balanceRaw,
				type: native ? 'native' : 'vsa',
				minBalanceRaw
			},
			recipients: amounts.map((amount) => ({ amount })),
			amountToDistribute: '',
			showAmountMenu: true
		}
	);
	const update = () => {
		for (const name of [
			'spendableUnits',
			'maxAmountString',
			'maxAmount',
			'totalAmount',
			'isValidAmount',
			'evenShare',
			'distributionFitsBalance',
			'canSplitEvenly',
			'canMaxEach',
			'totalRequiredForMax'
		]) {
			const assignment = source.match(new RegExp(`\\$:\\s*${name} =\\s*[\\s\\S]*?;`));
			if (assignment) run(assignment[0].replace('$:', ''));
		}
	};
	update();
	return { run, update };
}

test('Max at 2 ** 60 base units equals the held balance and passes the send gate', async () => {
	const { run } = await amountHarness([''], 18, 2 ** 60);
	expect(String(run('maxAmount'))).toBe('1.152921504606846976');
	run('recipients[0].amount = String(maxAmount)');
	expect(run('withinBalance(recipients, selectedToken)')).toBe(true);
});

test('even split refuses sub-base-unit shares and never fills exponent strings', async () => {
	const { run, update } = await amountHarness(['', '', ''], 7, 100);
	run('amountToDistribute = "0.0000001"');
	update();
	expect(run('canSplitEvenly')).toBe(false);
	run('distributeAmount("even")');
	expect(run('recipients.map(r => r.amount)')).toEqual(['', '', '']);
	run('amountToDistribute = "0.0000003"');
	update();
	expect(run('canSplitEvenly')).toBe(true);
	run('distributeAmount("even")');
	expect(run('recipients.map(r => r.amount)')).toEqual(Array(3).fill('0.0000001'));
});

test('totals are exact and invalid rows display an em dash', async () => {
	const { run, update } = await amountHarness(['0.1', '0.2'], 18, 2 ** 60);
	expect(run('totalAmount')).toBe('0.3');
	run('recipients[1].amount = "1e3"');
	update();
	expect(run('totalAmount')).toBe('—');
});

test('distribution input writes truncated decimals back even when the stored amount is unchanged', () => {
	const input = { value: '0.1234567' };
	const run = componentFunctions(['handleDistributeInput', 'enforceDecimals'], {
		input,
		selectedToken: { decimals: 6 },
		amountToDistribute: '0.123456'
	});
	run('handleDistributeInput(input)');
	expect(run('amountToDistribute')).toBe('0.123456');
	expect(input.value).toBe('0.123456');
});

test('distribution checks and required total use the same balance as send', async () => {
	const { run, update } = await amountHarness(['', '', ''], 18, 2 ** 60);
	run('amountToDistribute = "0.1"');
	update();
	expect(run('canMaxEach')).toBe(true);
	expect(run('totalRequiredForMax')).toBe('0.3');
	run('amountToDistribute = "1.152921504606847"');
	update();
	expect(run('canSplitEvenly')).toBe(false);
	expect(run('canMaxEach')).toBe(false);
	run('amountToDistribute = "1.152921504606846976"');
	update();
	expect(run('canSplitEvenly')).toBe(true);
});

test('duplicate recipients combine through exact amount arithmetic', async () => {
	const helpers = await import('../chain/sendAmounts');
	const run = componentFunctions(['combineRecipients', 'enforceDecimals'], {
		...helpers,
		decimalToBaseUnits,
		selectedToken: { decimals: 18 },
		recipients: [
			{ address: 'ADDR', amount: '0.1' },
			{ address: 'ADDR', amount: '0.2' }
		],
		syncLookupBanner: () => {}
	});
	run('combineRecipients("sum")');
	expect(run('recipients.map(r => r.amount)')).toEqual(['0.3']);
});

test('confirmed total uses sent token precision, confirmed groups only, and invalid fallback', async () => {
	const helpers = await import('../chain/sendAmounts');
	const run = componentFunctions(['displayTotal', 'enforceDecimals'], {
		...helpers,
		sumBaseUnits,
		groupOutcomes: [{ status: 'confirmed' }, { status: 'pending' }, { status: 'confirmed' }],
		recipientsByGroup: [
			[{ amount: '0.1' }],
			[{ amount: '99' }],
			[{ amount: '0.200000000000000001' }]
		],
		sentToken: { decimals: 18 },
		selectedToken: { decimals: 6 }
	});
	const assignment = source.match(/\$:\s*confirmedTotal =\s*[\s\S]*?;/)![0].replace('$:', '');
	run(assignment);
	expect(run('confirmedTotal')).toBe('0.300000000000000001');
	run('recipientsByGroup[2][0].amount = "bad"');
	run(assignment);
	expect(run('confirmedTotal')).toBe('—');
	run('recipientsByGroup[2][0].amount = "0.2000009"; sentToken = null');
	run(assignment);
	expect(run('confirmedTotal')).toBe('0.3');
});

test.each([
	['1.', 6],
	['12', 0]
] as const)('distribution input %j at %i decimals is not written back', (value, decimals) => {
	const setter = vi.fn();
	const input = {
		get value() {
			return value;
		},
		set value(next: string) {
			setter(next);
		}
	};
	const run = componentFunctions(['handleDistributeInput', 'enforceDecimals'], {
		input,
		selectedToken: { decimals },
		amountToDistribute: ''
	});
	run('handleDistributeInput(input)');
	expect(input.value).toBe(value);
	expect(setter).not.toHaveBeenCalled();
});

test.each([NaN, Infinity, -1])(
	'invalid balance %s becomes zero without breaking Max',
	async (balance) => {
		const { run } = await amountHarness([''], 6, balance);
		expect(run('spendableUnits')).toBe(0n);
		expect(run('maxAmountString')).toBe('0');
	}
);

test('Max reads the exact balance string when the token carries one', async () => {
	// The number can only hold 9007199254740992; the raw string is the true balance.
	const { run } = await amountHarness([''], 0, 2 ** 53, '9007199254740993');
	expect(run('spendableUnits')).toBe(9007199254740993n);
	expect(run('maxAmountString')).toBe('9007199254740993');
});

test('non-integer token decimals do not break Max', async () => {
	const { run } = await amountHarness([''], 1.5, 5);
	expect(run('maxAmountString')).toBe('0');
});

test('native Max and the send gate reserve the minimum balance and one fee', async () => {
	const { run } = await amountHarness([''], 6, 5_000_000, '5000000', true, '100000');
	expect(run('maxAmount')).toBe('4.899');
	run('recipients[0].amount = maxAmount');
	expect(run('withinBalance(recipients, selectedToken)')).toBe(true);
	run('recipients[0].amount = "4.899001"');
	expect(run('withinBalance(recipients, selectedToken)')).toBe(false);
});

test('native Max reserves the minimum balance for an account with opt-ins', async () => {
	const { run } = await amountHarness([''], 6, 5_000_000, '5000000', true, '400000');
	expect(run('maxAmount')).toBe('4.599');
	run('recipients[0].amount = maxAmount');
	expect(run('withinBalance(recipients, selectedToken)')).toBe(true);
	run('recipients[0].amount = "4.599001"');
	expect(run('withinBalance(recipients, selectedToken)')).toBe(false);
});

test.each(['syncTokenProp', 'handleTokenChange'])(
	'%s preserves the known native minimum balance',
	(handler) => {
		const run = componentFunctions([handler], {
			tokenKey,
			isSending: false,
			selectedToken: { type: 'vsa', id: '1' },
			nativeVoiToken: { balance: 5000000, balanceRaw: '5000000', minBalanceRaw: '400000' },
			recheckRecipients: vi.fn()
		});
		run(`${handler}({ type: 'native', decimals: 6, balance: 5000000 })`);
		expect(run('selectedToken.minBalanceRaw')).toBe('400000');
	}
);

test('native Max and distribution limits update with the number of rows', async () => {
	const { run, update } = await amountHarness([''], 6, 5_000_000, '5000000', true, '100000');
	run('recipients.push({ amount: "" }, { amount: "" }); amountToDistribute = "4.898"');
	update();
	expect(run('maxAmount')).toBe('4.897');
	expect(run('distributionFitsBalance')).toBe(false);
	run('amountToDistribute = "4.897"');
	update();
	expect(run('distributionFitsBalance')).toBe(true);
	run('amountToDistribute = "1.632334"');
	update();
	expect(run('canMaxEach')).toBe(false);
	run('amountToDistribute = "1.632333"');
	update();
	expect(run('canMaxEach')).toBe(true);
});

test.each([undefined, '', '-1', '1e5', '100000.0'])(
	'native Max falls back for minimum balance %j',
	async (minBalanceRaw) => {
		const { run } = await amountHarness([''], 6, 5_000_000, '5000000', true, minBalanceRaw);
		expect(run('maxAmount')).toBe('4.899');
	}
);

test('non-native Max keeps the full token balance', async () => {
	const { run } = await amountHarness([''], 6, 5_000_000, '5000000', false, '100000');
	expect(run('maxAmount')).toBe('5');
	run('recipients[0].amount = maxAmount');
	expect(run('withinBalance(recipients, selectedToken)')).toBe(true);
});

function nativeSendHarness(
	amount: string,
	params = suggestedParams,
	requireAccountInfo = vi.fn().mockResolvedValue({ amount: 5000000n, minBalance: 100000n })
) {
	const payment = vi.fn(buildPayment);
	const signTransactions = vi.fn().mockResolvedValue([new Uint8Array([1])]);
	const sendGroups = vi.fn().mockResolvedValue(undefined);
	const wallet = selectedWalletGlobals();
	const run = componentFunctions(['handleSend', 'withinBalance', 'buildVOITransaction'], {
		...wallet,
		Error,
		requireAccountInfo,
		algosdk,
		decimalToBaseUnits,
		sumBaseUnits,
		buildPayment: payment,
		signTransactions,
		sendGroups,
		algodClient: {
			getTransactionParams: () => ({
				do: async () => ({ ...params })
			})
		},
		selectedToken: {
			type: 'native',
			decimals: 6,
			symbol: 'VOI',
			balance: 5_000_000,
			balanceRaw: '5000000',
			minBalanceRaw: '100000'
		},
		recipients: [{ address: wallet.accountAddress, amount }],
		tracker: {},
		isSending: false,
		txState: 'idle',
		error: null,
		pinTick: 0,
		pendingController: undefined,
		AbortController,
		isARC200Token: () => false,
		MAX_TXN_PER_GROUP: 16,
		MAX_GROUPS_PER_SIGNING: 16,
		sendDeps: {},
		createOutcomeHandler: vi.fn(),
		recordOutcome: vi.fn()
	});
	return { run, payment, signTransactions, sendGroups, wallet, requireAccountInfo };
}

test.each([
	[true, 5000, 1000, '4.899', false],
	[true, 5000, 1000, '4.895', true],
	[true, 1000, 1000, '4.899', true],
	[false, 0, 5000, '4.899', false],
	[false, 0, 1000, '4.899', true],
	[false, 10, 1000, '4.899', false],
	[false, 10, 1000, '4.89', true]
] as const)(
	'native send with flatFee %s, fee %s, minFee %s and amount %s succeeds: %s',
	async (flatFee, fee, minFee, amount, succeeds) => {
		const { run, payment, signTransactions, sendGroups, wallet, requireAccountInfo } =
			nativeSendHarness(amount, { ...suggestedParams, flatFee, fee, minFee });
		expect(run('withinBalance(recipients, selectedToken)')).toBe(true);
		await run('handleSend()');
		expect(run('isSending')).toBe(false);
		expect(run('txState')).toBe('idle');
		if (succeeds) {
			expect(run('error')).toBeNull();
			expect(signTransactions).toHaveBeenCalledOnce();
			expect(sendGroups).toHaveBeenCalledOnce();
			expect(run('showResults')).toBe(true);
		} else {
			expect(run('error')).toBe('Total plus network fees exceeds your available VOI balance');
			expect(signTransactions).not.toHaveBeenCalled();
			expect(sendGroups).not.toHaveBeenCalled();
		}
		expect(requireAccountInfo).toHaveBeenCalledExactlyOnceWith(wallet.accountAddress, {
			force: true
		});
		expect(payment).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ amount: decimalToBaseUnits(amount, 6) })
		);
		wallet.flow.dispose();
	}
);

test.each([
	[5000000n, 400000n, '4.899', false],
	[5000000n, 400000n, '4.5', true],
	[4900000n, 100000n, '4.899', false]
] as const)(
	'native send rechecks current balance %s and minimum %s for amount %s: %s',
	async (amount, minBalance, sendAmount, succeeds) => {
		const requireAccountInfo = vi.fn().mockResolvedValue({ amount, minBalance });
		const { run, signTransactions, sendGroups, wallet } = nativeSendHarness(
			sendAmount,
			suggestedParams,
			requireAccountInfo
		);
		expect(run('withinBalance(recipients, selectedToken)')).toBe(true);
		await run('handleSend()');
		expect(run('isSending')).toBe(false);
		expect(run('txState')).toBe('idle');
		if (succeeds) {
			expect(run('error')).toBeNull();
			expect(signTransactions).toHaveBeenCalledOnce();
			expect(sendGroups).toHaveBeenCalledOnce();
		} else {
			expect(run('error')).toBe('Total plus network fees exceeds your available VOI balance');
			expect(signTransactions).not.toHaveBeenCalled();
			expect(sendGroups).not.toHaveBeenCalled();
		}
		expect(requireAccountInfo).toHaveBeenCalledExactlyOnceWith(wallet.accountAddress, {
			force: true
		});
		wallet.flow.dispose();
	}
);

test('native send stops when fresh account info cannot be fetched', async () => {
	const requireAccountInfo = vi.fn().mockRejectedValue(new Error('Account lookup failed'));
	const { run, signTransactions, sendGroups, wallet } = nativeSendHarness(
		'4.5',
		suggestedParams,
		requireAccountInfo
	);
	await run('handleSend()');
	expect(run('error')).toBe('Account lookup failed');
	expect(signTransactions).not.toHaveBeenCalled();
	expect(sendGroups).not.toHaveBeenCalled();
	expect(run('isSending')).toBe(false);
	expect(run('txState')).toBe('idle');
	wallet.flow.dispose();
});

test('native send includes built fees from every transaction group before signing', async () => {
	const { run, payment, signTransactions, sendGroups, wallet } = nativeSendHarness('0.285', {
		...suggestedParams,
		fee: 5000
	});
	run('recipients = Array.from({ length: 17 }, () => ({ ...recipients[0] }))');
	expect(run('withinBalance(recipients, selectedToken)')).toBe(true);
	await run('handleSend()');
	expect(payment).toHaveBeenCalledTimes(17);
	expect(run('error')).toBe('Total plus network fees exceeds your available VOI balance');
	expect(signTransactions).not.toHaveBeenCalled();
	expect(sendGroups).not.toHaveBeenCalled();
	expect(run('isSending')).toBe(false);
	expect(run('txState')).toBe('idle');
	wallet.flow.dispose();
});
