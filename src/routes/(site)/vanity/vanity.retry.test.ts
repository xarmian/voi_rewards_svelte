import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import algosdk from 'algosdk';
import { parse } from 'svelte/compiler';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import { selectionDrifted } from '../../../lib/chain/vanityPlan';

const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
const fn = (name: string) =>
	source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';
const funder = algosdk.encodeAddress(new Uint8Array(32));
const switched = algosdk.encodeAddress(new Uint8Array(32).fill(1));
const vanity = algosdk.encodeAddress(new Uint8Array(32).fill(2));

function fixture(names = ['retryRekey', 'rekeyVanityAddress', 'activateVanityAddress']) {
	const signedRekey = new Uint8Array([2]);
	const signTxn = vi.fn(() => signedRekey);
	const buildPayment = vi.fn((payment: Record<string, unknown>) => ({ ...payment, signTxn }));
	const read = vi.fn().mockResolvedValue({ amount: 0n, authAddr: undefined });
	const send = vi.fn().mockResolvedValue({ txid: 'tx' });
	const pendingRead = vi.fn().mockResolvedValue({ confirmedRound: 0n, poolError: '' });
	const params = vi.fn().mockResolvedValue({});
	const context = createContext({
		$selectedWallet: { address: funder, app: 'Pera' },
		plan: { funder, rekeyTo: funder, vanity },
		result: { address: vanity, mnemonic: 'test mnemonic' },
		signer: { address: funder, walletId: 'pera' },
		isActivating: false,
		isRekeying: false,
		txnStatus: 'success',
		rekeyTxnStatus: 'error',
		txnError: 'previous rekey error',
		error: null,
		reviewOpen: false,
		reviewDrifted: false,
		retryDrifted: false,
		fundingTxId: null,
		selectionDrifted,
		buildPayment,
		signTransactions: vi.fn().mockResolvedValue([new Uint8Array([1])]),
		captureSigner: vi.fn(() => {
			throw new Error('Retry must not capture a signer');
		}),
		algodClient: {
			accountInformation: vi.fn(() => ({ do: read })),
			pendingTransactionInformation: vi.fn(() => ({ do: pendingRead })),
			getTransactionParams: vi.fn(() => ({ do: params })),
			sendRawTransaction: vi.fn(() => ({ do: send }))
		},
		algosdk: {
			mnemonicToSecretKey: vi.fn(() => ({ sk: new Uint8Array([3]) })),
			waitForConfirmation: vi.fn().mockResolvedValue({})
		},
		Error,
		console: { error: vi.fn() },
		ready: true,
		prefix: 'VOI',
		suffix: '',
		isGenerating: false,
		attempts: 0,
		progress: 0,
		lastAddressCheckedByWorker: null,
		startTime: null,
		updateInterval: null,
		worker: null,
		maxAttempts: 100,
		setInterval: vi.fn(() => 42),
		clearInterval: vi.fn(),
		updateStats: vi.fn(),
		URL,
		Worker: vi.fn(function () {
			return { postMessage: vi.fn(), terminate: vi.fn() };
		})
	});
	for (const name of names) expect(fn(name), `${name} must be extracted`).not.toBe('');
	runInContext(
		ts.transpileModule(
			names
				.map((name) => fn(name).replace('import.meta.url', "'https://example.test/vanity'"))
				.join('\n'),
			{
				compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
			}
		).outputText,
		context
	);
	return { context, read, send, params, pendingRead, buildPayment, signTxn, signedRekey };
}

function expectNoSend(f: ReturnType<typeof fixture>) {
	expect(f.context.algodClient.sendRawTransaction).not.toHaveBeenCalled();
	expect(f.buildPayment).not.toHaveBeenCalled();
	expect(f.context.signTransactions).not.toHaveBeenCalled();
	expect(f.context.captureSigner).not.toHaveBeenCalled();
}

test('drift after a failed rekey is checked at click time and sends nothing', async () => {
	const f = fixture();
	f.context.$selectedWallet.address = switched;
	// Leave the reactive flag stale to exercise the live store check.
	await runInContext('retryRekey()', f.context);
	expectNoSend(f);
	expect(f.context.algodClient.accountInformation).not.toHaveBeenCalled();
	expect(f.context.retryDrifted).toBe(true);
});

test('retry sends exactly one zero-amount self rekey with the vanity key and no wallet signature', async () => {
	const f = fixture();
	await runInContext('retryRekey()', f.context);
	expect(f.context.algodClient.accountInformation).toHaveBeenCalledExactlyOnceWith(vanity);
	expect(f.context.algodClient.sendRawTransaction).toHaveBeenCalledExactlyOnceWith(f.signedRekey);
	expect(f.buildPayment).toHaveBeenCalledExactlyOnceWith({
		from: vanity,
		to: vanity,
		amount: 0,
		rekeyTo: funder,
		suggestedParams: {}
	});
	expect(f.signTxn).toHaveBeenCalledExactlyOnceWith(new Uint8Array([3]));
	expect(f.context.signTransactions).not.toHaveBeenCalled();
	expect(f.context.captureSigner).not.toHaveBeenCalled();
	expect(f.context.rekeyTxnStatus).toBe('success');
});

test('retry never changes the reviewed target and reselecting it enables retry again', async () => {
	const f = fixture();
	const reactive = source.match(/\$:\s*retryDrifted = [^;]+;/)?.[0];
	expect(reactive).toBeDefined();
	f.context.$selectedWallet.address = switched;
	runInContext(reactive!, f.context);
	expect(f.context.retryDrifted).toBe(true);
	await runInContext('retryRekey()', f.context);
	expectNoSend(f);
	expect(f.context.plan.rekeyTo).toBe(funder);
	f.context.$selectedWallet.address = funder;
	runInContext(reactive!, f.context);
	expect(f.context.retryDrifted).toBe(false);
	await runInContext('retryRekey()', f.context);
	expect(f.context.plan.rekeyTo).toBe(funder);
	expect(f.buildPayment.mock.calls[0][0].rekeyTo).toBe(funder);
	expect(f.context.algodClient.sendRawTransaction).toHaveBeenCalledOnce();
});

test('a landed rekey is recognized by its auth address and sends nothing', async () => {
	const f = fixture();
	f.read.mockResolvedValue({ amount: 1000000n, authAddr: algosdk.Address.fromString(funder) });
	await runInContext('retryRekey()', f.context);
	expectNoSend(f);
	expect(f.context.rekeyTxnStatus).toBe('success');
	expect(f.context.txnError).toBeNull();
});

test('a retry account read error sends nothing and reports the current error', async () => {
	const f = fixture();
	f.read.mockRejectedValue(new Error('retry read failed'));
	await runInContext('retryRekey()', f.context);
	expectNoSend(f);
	expect(f.context.rekeyTxnStatus).toBe('error');
	expect(f.context.txnError).toBe('retry read failed');
	expect(f.context.isRekeying).toBe(false);
});

test.each([1000000n, 2000000n])(
	'a balance of %s is not funded again or automatically rekeyed',
	async (amount) => {
		// The real rekeyVanityAddress is loaded, so an automatic rekey would show as a send.
		const f = fixture(['activateVanityAddress', 'rekeyVanityAddress']);
		f.read.mockResolvedValue({ amount, authAddr: undefined });
		await runInContext('activateVanityAddress(plan, signer)', f.context);
		expect(f.context.algodClient.accountInformation).toHaveBeenCalledExactlyOnceWith(vanity);
		expectNoSend(f);
		expect(f.params).not.toHaveBeenCalled();
		expect(f.context.txnStatus).toBe('success');
		expect(f.context.rekeyTxnStatus).toBe('idle');
		expect(f.context.isActivating).toBe(false);
	}
);

test('a funding account read error sends nothing and reports funding error', async () => {
	const f = fixture(['activateVanityAddress', 'rekeyVanityAddress']);
	f.read.mockRejectedValue(new Error('funding read failed'));
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expectNoSend(f);
	expect(f.params).not.toHaveBeenCalled();
	expect(f.context.txnStatus).toBe('error');
	expect(f.context.txnError).toBe('funding read failed');
});

// A payment that was sent but not yet seen in the balance may still land: never send a second one.
async function fundTimesOut() {
	const f = fixture(['activateVanityAddress', 'rekeyVanityAddress']);
	f.context.algosdk.waitForConfirmation.mockRejectedValueOnce(new Error('confirmation timed out'));
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expect(f.send).toHaveBeenCalledOnce();
	expect(f.context.txnStatus).toBe('error');
	expect(f.context.fundingTxId).toBe('tx');
	f.send.mockClear();
	f.context.algodClient.sendRawTransaction.mockClear();
	f.params.mockClear();
	f.buildPayment.mockClear();
	f.context.signTransactions.mockClear();
	return f;
}

test('a funding payment still pending is not paid again', async () => {
	const f = await fundTimesOut();
	f.pendingRead.mockResolvedValue({ confirmedRound: 0n, poolError: '' });
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expect(f.context.algodClient.pendingTransactionInformation).toHaveBeenCalledWith('tx');
	expectNoSend(f);
	expect(f.context.txnStatus).toBe('error');
	expect(f.context.txnError).toContain('still pending');
	expect(f.context.fundingTxId).toBe('tx');
});

test('a funding payment that confirmed late counts as funded and is not paid again or rekeyed', async () => {
	const f = await fundTimesOut();
	f.pendingRead.mockResolvedValue({ confirmedRound: 12n, poolError: '' });
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expectNoSend(f);
	expect(f.params).not.toHaveBeenCalled();
	expect(f.context.txnStatus).toBe('success');
	expect(f.context.rekeyTxnStatus).toBe('idle');
	expect(f.context.fundingTxId).toBeNull();
});

test('a funding payment the pool rejected may be sent again', async () => {
	const f = await fundTimesOut();
	f.pendingRead.mockResolvedValue({ confirmedRound: 0n, poolError: 'transaction rejected' });
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expect(f.buildPayment.mock.calls[0][0]).toMatchObject({
		from: funder,
		to: vanity,
		amount: 1000000
	});
	expect(f.context.signTransactions).toHaveBeenCalledOnce();
	expect(f.send).toHaveBeenCalled();
});

test('an unreadable earlier funding payment sends nothing', async () => {
	const f = await fundTimesOut();
	f.pendingRead.mockRejectedValue(new Error('pending read failed'));
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expectNoSend(f);
	expect(f.context.txnStatus).toBe('error');
	expect(f.context.txnError).toBe('pending read failed');
	expect(f.context.fundingTxId).toBe('tx');
});

test('a new search forgets the earlier funding payment', async () => {
	const f = fixture(['generateVanityAddress', 'validateInputs']);
	// Funding timed out: not confirmed, so a search is allowed.
	Object.assign(f.context, { fundingTxId: 'tx', txnStatus: 'error' });
	await runInContext('generateVanityAddress()', f.context);
	expect(f.context.fundingTxId).toBeNull();
});

const refusal = 'Retry the rekey before starting a new search. Your 1 VOI is on this address.';

test.each(['idle', 'error', 'sending'])(
	'a search is refused while funding is confirmed and the rekey is %s, and keeps the work',
	async (rekeyTxnStatus) => {
		const f = fixture(['generateVanityAddress', 'validateInputs']);
		Object.assign(f.context, { rekeyTxnStatus, error: null });
		const before = { ...f.context };
		await runInContext('generateVanityAddress()', f.context);
		expect(f.context.error).toBe(refusal);
		expect(f.context.Worker).not.toHaveBeenCalled();
		expect(f.context.setInterval).not.toHaveBeenCalled();
		for (const name of [
			'plan',
			'result',
			'txnStatus',
			'rekeyTxnStatus',
			'txnError',
			'reviewOpen'
		]) {
			expect(f.context[name], name).toBe(before[name]);
		}
	}
);

test.each([
	{ txnStatus: 'success', rekeyTxnStatus: 'success' },
	{ txnStatus: 'error', rekeyTxnStatus: 'idle' },
	{ txnStatus: 'idle', rekeyTxnStatus: 'idle' }
])('a search is allowed when funding is $txnStatus and the rekey is $rekeyTxnStatus', async (s) => {
	const f = fixture(['generateVanityAddress', 'validateInputs']);
	Object.assign(f.context, s);
	await runInContext('generateVanityAddress()', f.context);
	expect(f.context.Worker).toHaveBeenCalledOnce();
	expect(f.context.error).toBeNull();
	expect(f.context.txnStatus).toBe('idle');
});

test('a retry clears the refusal message when it starts', async () => {
	const f = fixture();
	f.context.error = refusal;
	await runInContext('retryRekey()', f.context);
	expect(f.context.error).toBeNull();
});

test('a new search clears the previous plan, review and transaction state', async () => {
	const f = fixture(['generateVanityAddress', 'validateInputs']);
	Object.assign(f.context, { reviewOpen: true, reviewDrifted: true, rekeyTxnStatus: 'success' });
	await runInContext('generateVanityAddress()', f.context);
	for (const name of ['plan', 'result', 'txnError']) expect(f.context[name], name).toBeNull();
	for (const name of ['reviewOpen', 'reviewDrifted']) expect(f.context[name], name).toBe(false);
	for (const name of ['txnStatus', 'rekeyTxnStatus']) expect(f.context[name], name).toBe('idle');
	expect(f.context.Worker).toHaveBeenCalledOnce();
});

test.each(['isActivating', 'isRekeying'])('a search during %s does nothing', async (flag) => {
	const f = fixture(['generateVanityAddress', 'validateInputs']);
	f.context[flag] = true;
	const before = { ...f.context };
	await runInContext('generateVanityAddress()', f.context);
	for (const name of Object.keys(before)) expect(f.context[name], name).toBe(before[name]);
	expect(f.context.Worker).not.toHaveBeenCalled();
	expect(f.context.setInterval).not.toHaveBeenCalled();
});

test('rekey clears the earlier error and enters sending before awaiting parameters', async () => {
	const f = fixture(['rekeyVanityAddress']);
	const pending = Promise.withResolvers<object>();
	f.params.mockReturnValue(pending.promise);
	const rekey = runInContext('rekeyVanityAddress(plan)', f.context);
	expect(f.context.txnError).toBeNull();
	expect(f.context.rekeyTxnStatus).toBe('sending');
	pending.resolve({});
	await rekey;
});

test('activation clears the stale rekey stage and error before awaiting the balance', async () => {
	const f = fixture(['activateVanityAddress']);
	const pending = Promise.withResolvers<object>();
	f.read.mockReturnValue(pending.promise);
	const activation = runInContext('activateVanityAddress(plan, signer)', f.context);
	expect(f.context.txnStatus).toBe('sending');
	expect(f.context.rekeyTxnStatus).toBe('idle');
	expect(f.context.txnError).toBeNull();
	pending.resolve({ amount: 1000000n });
	await activation;
});

test.each(['missing plan', 'unconfirmed funding', 'activating', 'rekeying'])(
	'retry guards %s before reading or sending',
	async (state) => {
		const f = fixture();
		if (state === 'missing plan') f.context.plan = null;
		if (state === 'unconfirmed funding') f.context.txnStatus = 'error';
		if (state === 'activating') f.context.isActivating = true;
		if (state === 'rekeying') f.context.isRekeying = true;
		await runInContext('retryRekey()', f.context);
		expectNoSend(f);
		expect(f.read).not.toHaveBeenCalled();
	}
);

test('retry guards a changed generated address before reading or sending', async () => {
	const f = fixture();
	f.context.result.address = switched;
	await runInContext('retryRekey()', f.context);
	expectNoSend(f);
	expect(f.read).not.toHaveBeenCalled();
	expect(f.context.rekeyTxnStatus).toBe('error');
	expect(f.context.txnError).toBe('The generated vanity address changed. Review again.');
});

test('retry holds the in-flight guard during the chain read', async () => {
	const f = fixture([
		'retryRekey',
		'rekeyVanityAddress',
		'generateVanityAddress',
		'validateInputs'
	]);
	const pending = Promise.withResolvers<object>();
	f.read.mockReturnValue(pending.promise);
	const retry = runInContext('retryRekey()', f.context);
	await runInContext('retryRekey(); generateVanityAddress()', f.context);
	expect(f.read).toHaveBeenCalledOnce();
	expect(f.context.Worker).not.toHaveBeenCalled();
	pending.resolve({ authAddr: algosdk.Address.fromString(funder) });
	await retry;
});

// These source guards back the behavioural tests and pin the actions offered by Step 2.
test('funded retry branch exposes only the reviewed target and the rekey action', () => {
	const branch = source.match(
		/\{:else if txnStatus === 'success'\}([^]*?)\{:else if reviewOpen && plan\}/
	)?.[1];
	expect(branch).toBeDefined();
	expect(branch).not.toContain('Fund &amp; Rekey Address');
	expect(branch).toContain('<ResolvedAddress address={plan.rekeyTo} label="Rekey target" />');
	expect(branch).toMatch(
		/<Button\s+onclick=\{retryRekey\}\s+disabled=\{retryDrifted \|\| isActivating \|\| isRekeying\}\s*>\s*\{#if isRekeying \|\| rekeyTxnStatus === 'sending'\}\s*Rekeying Address\.\.\.\s*\{:else\}\s*Retry rekey\s*\{\/if\}\s*<\/Button>/
	);
	expect(branch).not.toMatch(/reviewActivation|confirmActivation|activateVanityAddress/);
	expect(branch).toMatch(
		/\{#if retryDrifted\}\s*<div class="\[overflow-wrap:anywhere\]">\s*<InlineAlert message="Your selected account changed\. Review again\."/
	);
	// Parse the complete template too, so the branch must be valid Svelte.
	expect(() => parse(source)).not.toThrow();
});

test('only review captures a target; retry cannot assign it or enter funding or wallet signing', () => {
	const outsideReview = source.replace(fn('reviewActivation'), '');
	expect(fn('reviewActivation')).toContain('plan = captured.plan');
	expect(outsideReview).not.toMatch(/plan\.rekeyTo\s*=(?!=)|plan\s*=\s*\{/);
	// Every assignment of the plan in the page: a search clears it, a review captures it, a cancel clears it.
	const assignments = [...source.matchAll(/^\s*plan = .*$/gm)].map((m) => m[0].trim()).sort();
	expect(assignments).toEqual(['plan = captured.plan;', 'plan = null;', 'plan = null;']);
	expect(fn('retryRekey')).not.toMatch(/\bplan\s*=(?!=)/);
	expect(fn('retryRekey')).not.toMatch(/activateVanityAddress|captureSigner|signTransactions/);
});
