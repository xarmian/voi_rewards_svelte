import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import algosdk from 'algosdk';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
const fn = (name: string) =>
	source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';

test('the real activation and rekey keep the confirmed funder when selection changes during signing', async () => {
	const funder = algosdk.encodeAddress(new Uint8Array(32));
	const switched = algosdk.encodeAddress(new Uint8Array(32).fill(1));
	const vanity = algosdk.encodeAddress(new Uint8Array(32).fill(2));
	const signing = Promise.withResolvers<Uint8Array[]>();
	const makePayment = vi.fn((payment: Record<string, unknown>) => ({
		...payment,
		signTxn: vi.fn(() => new Uint8Array())
	}));
	const context = createContext({
		$selectedWallet: { address: funder, app: 'Pera' },
		plan: { funder, rekeyTo: funder, vanity },
		result: { address: vanity, mnemonic: 'test mnemonic' },
		isActivating: false,
		isRekeying: false,
		txnStatus: 'idle',
		rekeyTxnStatus: 'idle',
		txnError: null,
		error: null,
		console,
		algosdk: {
			makePaymentTxnWithSuggestedParamsFromObject: makePayment,
			mnemonicToSecretKey: vi.fn(() => ({ sk: new Uint8Array() })),
			waitForConfirmation: vi.fn().mockResolvedValue({})
		},
		algodClient: {
			getTransactionParams: () => ({ do: vi.fn().mockResolvedValue({}) }),
			sendRawTransaction: () => ({ do: vi.fn().mockResolvedValue({ txId: 'tx' }) })
		}
	});
	context.signTransactions = vi.fn(() => {
		context.$selectedWallet = { address: switched, app: 'Defly' };
		return signing.promise;
	});
	runInContext(
		ts.transpileModule([fn('activateVanityAddress'), fn('rekeyVanityAddress')].join('\n'), {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	const activation = runInContext('activateVanityAddress(plan)', context);
	await vi.waitFor(() => expect(context.signTransactions).toHaveBeenCalledOnce());
	signing.resolve([new Uint8Array()]);
	await activation;
	expect(makePayment).toHaveBeenCalledTimes(2);
	expect(makePayment.mock.calls[0][0]).toMatchObject({ from: funder, to: vanity });
	expect(makePayment.mock.calls[1][0]).toMatchObject({
		from: vanity,
		to: vanity,
		rekeyTo: funder
	});
	expect(runInContext('rekeyTxnStatus', context)).toBe('success');
});

test('signing functions never read the live selection', () => {
	for (const name of ['activateVanityAddress', 'rekeyVanityAddress']) {
		expect(fn(name)).not.toContain('$selectedWallet');
		expect(fn(name)).toContain('plan');
	}
});

test('activation opens a cancellable review of full addresses before confirming its plan', () => {
	expect(source).toContain('on:click={reviewActivation}');
	expect(fn('reviewActivation')).toContain('capturePlan($selectedWallet, result?.address)');
	expect(source).toMatch(/<ResolvedAddress\s+address=\{plan\.vanity\}/);
	expect(source).toMatch(/<ResolvedAddress\s+address=\{plan\.rekeyTo\}/);
	expect(source).toContain('Your selected account changed. Review again.');
	expect(source).toContain('selectionDrifted(plan, $selectedWallet)');
	expect(source).toMatch(/disabled=\{reviewDrifted\}/);
	expect(fn('confirmActivation')).toContain('activateVanityAddress(plan)');
	expect(fn('confirmActivation')).toContain('reviewDrifted');
	expect(fn('cancelActivation')).toContain('plan = null');
});

test('Confirm re-checks the live selection itself, not only the reactive flag', () => {
	// The reactive reviewDrifted flag updates on the next tick; a change between that tick and the
	// click must still stop the activation.
	const confirm = fn('confirmActivation');
	const recheck = confirm.indexOf('selectionDrifted(plan, $selectedWallet)');
	const activate = confirm.indexOf('activateVanityAddress(plan)');
	expect(recheck, 'confirmActivation must call selectionDrifted itself').toBeGreaterThan(-1);
	expect(recheck, 'the re-check must come before the activation starts').toBeLessThan(activate);
	expect(confirm).toContain('reviewDrifted = true');
});
