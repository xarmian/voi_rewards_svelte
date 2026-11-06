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
		signTxn: vi.fn(() => new Uint8Array()),
		txID: () => 'tx',
		lastValid: 100n
	}));
	const context = createContext({
		$selectedWallet: { address: funder, app: 'Pera' },
		// The account captured at confirmation; the picker switching below must not change it.
		signer: Object.freeze({ address: funder, walletId: 'pera' }),
		plan: { funder, rekeyTo: funder, vanity },
		result: { address: vanity, mnemonic: 'test mnemonic' },
		isActivating: false,
		isRekeying: false,
		txnStatus: 'idle',
		rekeyTxnStatus: 'idle',
		txnError: null,
		fundingTxId: null,
		fundingLastValid: null,
		FUNDING_VALID_ROUNDS: 100,
		error: null,
		console,
		buildPayment: makePayment,
		algosdk: {
			mnemonicToSecretKey: vi.fn(() => ({ sk: new Uint8Array() })),
			waitForConfirmation: vi.fn().mockResolvedValue({})
		},
		algodClient: {
			accountInformation: () => ({
				do: vi.fn().mockResolvedValue({ amount: 0n, authAddr: undefined })
			}),
			getTransactionParams: () => ({
				do: vi.fn().mockResolvedValue({ firstValid: 1n, lastValid: 1001n })
			}),
			sendRawTransaction: () => ({ do: vi.fn().mockResolvedValue({ txid: 'tx' }) })
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
	const activation = runInContext('activateVanityAddress(plan, signer)', context);
	await vi.waitFor(() => expect(context.signTransactions).toHaveBeenCalledOnce(), {
		timeout: 5000
	});
	signing.resolve([new Uint8Array()]);
	await activation;
	// The picker moved to another account while the prompt was open; the funder still signed.
	expect(context.signTransactions.mock.calls[0][1]).toEqual({ address: funder, walletId: 'pera' });
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
	expect(source).toContain('onclick={() => reviewActivation()}');
	expect(fn('reviewActivation')).toContain('capturePlan($selectedWallet, result?.address)');
	expect(source).toMatch(/<ResolvedAddress\s+address=\{plan\.vanity\}/);
	expect(source).toMatch(/<ResolvedAddress\s+address=\{plan\.rekeyTo\}/);
	expect(source).toContain('Your selected account changed. Review again.');
	expect(source).toContain('selectionDrifted(plan, $selectedWallet)');
	expect(source).toMatch(/disabled=\{reviewDrifted\}/);
	expect(fn('confirmActivation')).toContain('activateVanityAddress(plan, signer)');
	expect(fn('confirmActivation')).toContain('reviewDrifted');
	expect(fn('cancelActivation')).toContain('plan = null');
});

test('Confirm signs as the account captured at confirmation, and only if it is the reviewed funder', () => {
	const confirm = fn('confirmActivation');
	const capture = confirm.indexOf('captureSigner()');
	const funderCheck = confirm.indexOf('signer.address !== plan.funder');
	const activate = confirm.indexOf('activateVanityAddress(plan, signer)');
	expect(capture, 'the signer is taken at confirmation').toBeGreaterThan(-1);
	expect(funderCheck, 'a different account counts as drift').toBeGreaterThan(capture);
	expect(activate).toBeGreaterThan(funderCheck);
	expect(fn('activateVanityAddress')).toContain('signTransactions([[unsignedTxn]], signer)');
});

test('Confirm re-checks the live selection itself, not only the reactive flag', () => {
	// The reactive reviewDrifted flag updates on the next tick; a change between that tick and the
	// click must still stop the activation.
	const confirm = fn('confirmActivation');
	const recheck = confirm.indexOf('selectionDrifted(plan, $selectedWallet)');
	const activate = confirm.indexOf('activateVanityAddress(plan, signer)');
	expect(recheck, 'confirmActivation must call selectionDrifted itself').toBeGreaterThan(-1);
	expect(recheck, 'the re-check must come before the activation starts').toBeLessThan(activate);
	expect(confirm).toContain('reviewDrifted = true');
});
