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

function fixture(
	names = ['retryRekey', 'rekeyVanityAddress', 'activateVanityAddress', 'earlierFundingLanded']
) {
	const signedRekey = new Uint8Array([2]);
	const signTxn = vi.fn(() => signedRekey);
	const buildPayment = vi.fn((payment: Record<string, unknown>) => ({
		...payment,
		signTxn,
		txID: () => 'tx',
		lastValid: (payment.suggestedParams as { lastValid?: bigint })?.lastValid ?? 0n
	}));
	const statusRead = vi.fn().mockResolvedValue({ lastRound: 50n });
	const read = vi.fn().mockResolvedValue({ amount: 0n, authAddr: undefined });
	const send = vi.fn().mockResolvedValue({ txid: 'tx' });
	const pendingRead = vi.fn().mockResolvedValue({ confirmedRound: 0n, poolError: '' });
	const params = vi.fn().mockResolvedValue({ firstValid: 1n, lastValid: 1001n });
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
		fundingLastValid: null,
		FUNDING_VALID_ROUNDS: 100,
		selectionDrifted,
		buildPayment,
		signTransactions: vi.fn().mockResolvedValue([new Uint8Array([1])]),
		captureSigner: vi.fn(() => {
			throw new Error('Retry must not capture a signer');
		}),
		algodClient: {
			accountInformation: vi.fn(() => ({ do: read })),
			pendingTransactionInformation: vi.fn(() => ({ do: pendingRead })),
			status: vi.fn(() => ({ do: statusRead })),
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
	return {
		context,
		read,
		send,
		params,
		pendingRead,
		statusRead,
		buildPayment,
		signTxn,
		signedRekey
	};
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
		suggestedParams: { firstValid: 1n, lastValid: 1001n }
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
		const f = fixture(['activateVanityAddress', 'earlierFundingLanded', 'rekeyVanityAddress']);
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
	const f = fixture(['activateVanityAddress', 'earlierFundingLanded', 'rekeyVanityAddress']);
	f.read.mockRejectedValue(new Error('funding read failed'));
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expectNoSend(f);
	expect(f.params).not.toHaveBeenCalled();
	expect(f.context.txnStatus).toBe('error');
	expect(f.context.txnError).toBe('funding read failed');
});

// A funding payment that was sent and not yet seen confirmed may still land until its last valid
// round (100 in these fixtures; the node is at round 50): never send a second one before then.
const expired = 102n;

async function fundTimesOut(failure: 'confirm' | 'send' = 'confirm') {
	const f = fixture(['activateVanityAddress', 'earlierFundingLanded', 'rekeyVanityAddress']);
	if (failure === 'confirm') {
		f.context.algosdk.waitForConfirmation.mockRejectedValueOnce(
			new Error('confirmation timed out')
		);
	} else {
		f.send.mockRejectedValueOnce(new Error('response lost'));
	}
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expect(f.send).toHaveBeenCalledOnce();
	expect(f.context.txnStatus).toBe('error');
	// Remembered before the send, so a lost response is not read as "not sent".
	expect(f.context.fundingTxId).toBe('tx');
	expect(f.context.fundingLastValid).toBe(101n);
	f.send.mockClear();
	f.context.algodClient.sendRawTransaction.mockClear();
	f.params.mockClear();
	f.buildPayment.mockClear();
	f.context.signTransactions.mockClear();
	return f;
}

async function secondAttempt(f: Awaited<ReturnType<typeof fundTimesOut>>) {
	await runInContext('activateVanityAddress(plan, signer)', f.context);
}

test.each(['confirm', 'send'] as const)(
	'a payment whose %s step failed and is still in the pool is not paid again',
	async (failure) => {
		const f = await fundTimesOut(failure);
		f.pendingRead.mockResolvedValue({ confirmedRound: 0n, poolError: '' });
		await secondAttempt(f);
		expect(f.context.algodClient.pendingTransactionInformation).toHaveBeenCalledWith('tx');
		expectNoSend(f);
		expect(f.context.txnStatus).toBe('error');
		expect(f.context.txnError).toContain('may still land');
		expect(f.context.fundingTxId).toBe('tx');
	}
);

test.each(['confirm', 'send'] as const)(
	'a payment the node does not know is not paid again before its last valid round (%s step failed)',
	async (failure) => {
		const f = await fundTimesOut(failure);
		f.pendingRead.mockRejectedValue(new Error('transaction not found'));
		await secondAttempt(f);
		expectNoSend(f);
		expect(f.context.txnError).toContain('may still land');
		expect(f.context.fundingTxId).toBe('tx');
		expect(f.context.fundingLastValid).toBe(101n);
	}
);

test('a payment the pool rejected is not paid again before its last valid round', async () => {
	const f = await fundTimesOut();
	f.pendingRead.mockResolvedValue({ confirmedRound: 0n, poolError: 'rejected by this node' });
	await secondAttempt(f);
	expectNoSend(f);
	expect(f.context.fundingTxId).toBe('tx');
});

test.each([
	['unknown to the node', () => Promise.reject(new Error('transaction not found'))],
	['rejected by the pool', () => Promise.resolve({ confirmedRound: 0n, poolError: 'rejected' })]
])(
	'a payment %s may be sent again once its last valid round has passed',
	async (_name, pending) => {
		const f = await fundTimesOut();
		f.pendingRead.mockImplementation(pending);
		f.statusRead.mockResolvedValue({ lastRound: expired });
		await secondAttempt(f);
		expect(f.buildPayment.mock.calls[0][0]).toMatchObject({
			from: funder,
			to: vanity,
			amount: 1000000
		});
		expect(f.context.signTransactions).toHaveBeenCalledOnce();
		// Exactly one new payment of 1 VOI (the automatic rekey after it is the other send).
		expect(f.buildPayment.mock.calls.filter(([p]) => p.amount === 1000000)).toHaveLength(1);
		expect(f.context.fundingTxId).toBeNull();
	}
);

test('a payment that landed late and is visible after expiry counts as funded and sends nothing', async () => {
	const f = await fundTimesOut();
	f.pendingRead.mockRejectedValue(new Error('transaction not found'));
	f.statusRead.mockResolvedValue({ lastRound: expired });
	// The first balance read is unfunded; the one after expiry shows the payment.
	f.read.mockResolvedValueOnce({ amount: 0n }).mockResolvedValueOnce({ amount: 1000000n });
	await secondAttempt(f);
	expectNoSend(f);
	expect(f.params).not.toHaveBeenCalled();
	expect(f.context.txnStatus).toBe('success');
	expect(f.context.rekeyTxnStatus).toBe('idle');
	expect(f.context.fundingTxId).toBeNull();
	expect(f.context.fundingLastValid).toBeNull();
});

test('a payment that confirmed late counts as funded and is not paid again or rekeyed', async () => {
	const f = await fundTimesOut();
	f.pendingRead.mockResolvedValue({ confirmedRound: 12n, poolError: '' });
	await secondAttempt(f);
	expectNoSend(f);
	expect(f.params).not.toHaveBeenCalled();
	expect(f.context.txnStatus).toBe('success');
	expect(f.context.rekeyTxnStatus).toBe('idle');
	expect(f.context.fundingTxId).toBeNull();
});

test('an unreadable round or earlier payment state sends nothing', async () => {
	const a = await fundTimesOut();
	a.pendingRead.mockRejectedValue(new Error('pending read failed'));
	a.statusRead.mockRejectedValue(new Error('status read failed'));
	await secondAttempt(a);
	expectNoSend(a);
	expect(a.context.txnError).toBe('status read failed');
	expect(a.context.fundingTxId).toBe('tx');
	const b = await fundTimesOut();
	b.pendingRead.mockRejectedValue(new Error('transaction not found'));
	b.statusRead.mockResolvedValue({ lastRound: expired });
	b.read
		.mockResolvedValueOnce({ amount: 0n })
		.mockRejectedValueOnce(new Error('balance read failed'));
	await secondAttempt(b);
	expectNoSend(b);
	expect(b.context.txnError).toBe('balance read failed');
});

test('the 1 VOI payment gets a short validity window; the rekey keeps the node default', async () => {
	const f = fixture(['activateVanityAddress', 'earlierFundingLanded', 'rekeyVanityAddress']);
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	const payment = f.buildPayment.mock.calls.find(([p]) => p.amount === 1000000)![0];
	expect(payment.suggestedParams).toMatchObject({ firstValid: 1n, lastValid: 101n });
	const rekey = f.buildPayment.mock.calls.find(([p]) => p.amount === 0)![0];
	expect(rekey.suggestedParams).toEqual({ firstValid: 1n, lastValid: 1001n });
	// The window that was signed is the window that is remembered for settling.
	const g = fixture(['activateVanityAddress', 'earlierFundingLanded', 'rekeyVanityAddress']);
	g.context.algosdk.waitForConfirmation.mockRejectedValueOnce(new Error('confirmation timed out'));
	await runInContext('activateVanityAddress(plan, signer)', g.context);
	expect(g.context.fundingLastValid).toBe(101n);
});

test('a payment whose send was refused after its window can be funded again once expired', async () => {
	const f = await fundTimesOut('send');
	f.pendingRead.mockRejectedValue(new Error('transaction not found'));
	f.statusRead.mockResolvedValue({ lastRound: expired });
	await secondAttempt(f);
	expect(f.buildPayment.mock.calls.filter(([p]) => p.amount === 1000000)).toHaveLength(1);
});

test('while a funding payment is unsettled the button reads as a retry and the search message says wait', () => {
	const button = source.match(/\{:else if fundingTxId\}\s*([^{]*?)\s*\{:else\}/)?.[1];
	expect(button).toBe('Retry funding');
	expect(source).toContain(
		'A funding payment may still land on this address. Wait a moment, then retry before starting a new search.'
	);
	expect(source).not.toContain('then fund again');
});

test('a stale pool entry does not block a payment once its last valid round has passed', async () => {
	const f = await fundTimesOut();
	f.pendingRead.mockResolvedValue({ confirmedRound: 0n, poolError: '' });
	f.statusRead.mockResolvedValue({ lastRound: expired });
	await secondAttempt(f);
	expect(f.buildPayment.mock.calls.filter(([p]) => p.amount === 1000000)).toHaveLength(1);
	expect(f.context.fundingTxId).toBeNull();
});

test('a payment the node refused outright (HTTP 400) is forgotten and can be funded at once', async () => {
	const f = fixture(['activateVanityAddress', 'earlierFundingLanded', 'rekeyVanityAddress']);
	f.send.mockRejectedValueOnce(
		Object.assign(new Error('overspend'), { response: { status: 400 } })
	);
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expect(f.context.txnStatus).toBe('error');
	expect(f.context.fundingTxId).toBeNull();
	expect(f.context.fundingLastValid).toBeNull();
	// The node is still before the window's end and does not know the payment: nothing to wait for.
	f.pendingRead.mockRejectedValue(new Error('transaction not found'));
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expect(f.buildPayment.mock.calls.filter(([p]) => p.amount === 1000000)).toHaveLength(2);
	expect(f.context.txnStatus).toBe('success');
});

test.each([
	'Network request error. Received status 400 (Bad Request): transaction already in ledger',
	'Network request error. Received status 400 (Bad Request): txn already in the pool'
])('a 400 that says the payment is already known keeps it remembered: %s', async (message) => {
	const f = fixture(['activateVanityAddress', 'earlierFundingLanded', 'rekeyVanityAddress']);
	f.send.mockRejectedValueOnce(Object.assign(new Error(message), { response: { status: 400 } }));
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expect(f.context.txnStatus).toBe('error');
	expect(f.context.fundingTxId).toBe('tx');
	expect(f.context.fundingLastValid).toBe(101n);
	// And a second attempt is refused until the window has passed, not sent.
	f.context.signTransactions.mockClear();
	f.send.mockClear();
	f.context.algodClient.sendRawTransaction.mockClear();
	f.buildPayment.mockClear();
	f.pendingRead.mockRejectedValue(new Error('transaction not found'));
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expectNoSend(f);
	expect(f.context.txnError).toContain('may still land');
});

test.each([503, undefined])(
	'a send that failed with status %s leaves the payment unknown and remembered',
	async (status) => {
		const f = fixture(['activateVanityAddress', 'earlierFundingLanded', 'rekeyVanityAddress']);
		f.send.mockRejectedValueOnce(
			Object.assign(new Error('send failed'), status ? { response: { status } } : {})
		);
		await runInContext('activateVanityAddress(plan, signer)', f.context);
		expect(f.context.fundingTxId).toBe('tx');
		expect(f.context.fundingLastValid).toBe(101n);
	}
);

test('the retry stays in flight through the follow-up chain read after a failed rekey send', async () => {
	const f = fixture();
	f.send.mockRejectedValueOnce(new Error('rekey send failed'));
	const followUp = Promise.withResolvers<object>();
	f.read
		.mockResolvedValueOnce({ amount: 1000000n, authAddr: undefined })
		.mockReturnValueOnce(followUp.promise);
	const retry = runInContext('retryRekey()', f.context);
	await vi.waitFor(() => expect(f.read).toHaveBeenCalledTimes(2));
	// The rekey send has already failed and released its own flag; the retry must hold it again.
	expect(f.context.isRekeying).toBe(true);
	expect(f.context.rekeyTxnStatus).toBe('sending');
	await runInContext('retryRekey()', f.context);
	expect(f.read).toHaveBeenCalledTimes(2);
	expect(f.send).toHaveBeenCalledOnce();
	followUp.resolve({ amount: 1000000n, authAddr: algosdk.Address.fromString(funder) });
	await retry;
	expect(f.context.rekeyTxnStatus).toBe('success');
	expect(f.context.txnError).toBeNull();
	expect(f.context.isRekeying).toBe(false);
});

test('a follow-up chain read that fails keeps the rekey error and releases the retry', async () => {
	const f = fixture();
	f.send.mockRejectedValueOnce(new Error('rekey send failed'));
	f.read
		.mockResolvedValueOnce({ amount: 1000000n, authAddr: undefined })
		.mockRejectedValueOnce(new Error('follow-up read failed'));
	await runInContext('retryRekey()', f.context);
	expect(f.context.rekeyTxnStatus).toBe('error');
	expect(f.context.txnError).toBe('rekey send failed');
	expect(f.context.isRekeying).toBe(false);
});

test('a payment that was never signed is not remembered', async () => {
	const f = fixture(['activateVanityAddress', 'earlierFundingLanded', 'rekeyVanityAddress']);
	f.context.signTransactions.mockRejectedValueOnce(new Error('rejected in wallet'));
	await runInContext('activateVanityAddress(plan, signer)', f.context);
	expect(f.send).not.toHaveBeenCalled();
	expect(f.context.fundingTxId).toBeNull();
	expect(f.context.fundingLastValid).toBeNull();
});

test('a search is refused while an earlier funding payment is unsettled, and keeps it', async () => {
	const f = fixture(['generateVanityAddress', 'validateInputs']);
	Object.assign(f.context, {
		txnStatus: 'error',
		rekeyTxnStatus: 'idle',
		fundingTxId: 'tx',
		fundingLastValid: 101n
	});
	await runInContext('generateVanityAddress()', f.context);
	expect(f.context.error).toContain('A funding payment may still land');
	expect(f.context.Worker).not.toHaveBeenCalled();
	expect(f.context.plan).not.toBeNull();
	expect(f.context.result).not.toBeNull();
	expect(f.context.fundingTxId).toBe('tx');
});

test('a rekey that landed after the retry read is reported as success, not as an error', async () => {
	const f = fixture();
	f.send.mockRejectedValueOnce(new Error('transaction already in ledger'));
	f.read
		.mockResolvedValueOnce({ amount: 1000000n, authAddr: undefined })
		.mockResolvedValueOnce({ amount: 1000000n, authAddr: algosdk.Address.fromString(funder) });
	await runInContext('retryRekey()', f.context);
	expect(f.context.rekeyTxnStatus).toBe('success');
	expect(f.context.txnError).toBeNull();
});

test('a rekey that did not land after the retry read stays an error', async () => {
	const f = fixture();
	f.send.mockRejectedValueOnce(new Error('network down'));
	await runInContext('retryRekey()', f.context);
	expect(f.context.rekeyTxnStatus).toBe('error');
	expect(f.context.txnError).toBe('network down');
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
		/\{#if retryDrifted\}\s*<div class="\[overflow-wrap:anywhere\]">\s*<InlineAlert\s+message="Your selected account changed\. Select the reviewed account again to retry\."/
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
