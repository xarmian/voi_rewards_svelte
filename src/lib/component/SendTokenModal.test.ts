import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import algosdk from 'algosdk';
import ts from 'typescript';
import { expect, test } from 'vitest';
import { buildAssetTransfer, buildCombinedPayment, buildPayment } from '$lib/chain/txBuilders';

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
		$selectedWallet: { address },
		captureSigner: () => ({ address, walletId: 'pera' })
	};
}

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
