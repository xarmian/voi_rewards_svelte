import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import algosdk from 'algosdk';
import ts from 'typescript';
import { expect, test } from 'vitest';

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
	const context = createContext(globals);
	runInContext(
		ts.transpileModule(script, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	return (code: string) => runInContext(code, context);
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
			$selectedWallet: { address: algosdk.generateAccount().addr },
			selectedToken: { decimals: 6, symbol: 'VOI' },
			tracker: {},
			recipients: ['1', amount].map((value) => ({
				address: algosdk.generateAccount().addr,
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

const suggestedParams = {
	fee: 1000,
	flatFee: true,
	firstRound: 1,
	lastRound: 1000,
	genesisHash: Buffer.alloc(32).toString('base64'),
	genesisID: 'test'
};

test.each(['buildVOITransaction', 'buildVSATransaction'])(
	'%s preserves bigint amounts through the installed SDK',
	async (builder) => {
		const run = componentFunctions([builder], {
			algosdk,
			sender: algosdk.generateAccount().addr,
			recipient: algosdk.generateAccount().addr,
			suggestedParams
		});
		const txn = await run(
			`${builder}({ id: '1' }, sender, recipient, 9007199254740993n, suggestedParams)`
		);
		expect(txn.amount).toBe(9007199254740993n);
	}
);

test('combined ARC-200 payments sum exact raw units', () => {
	const sender = algosdk.generateAccount().addr;
	const recipient = algosdk.generateAccount().addr;
	const payments = [9007199254740993n, 2n].map((amount) => [
		algosdk.makePaymentTxnWithSuggestedParamsFromObject({
			from: sender,
			to: recipient,
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
	expect(groups[0][0].amount).toBe(9007199254740995n);
});
