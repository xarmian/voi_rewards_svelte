import algosdk from 'algosdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as sending from './sendAndConfirm';
import { canOfferWithdraw, sendWithdrawal } from './withdrawSend';
import {
	getPendingWithdrawal,
	pendingWithdrawalStorageKey,
	rememberPendingWithdrawal
} from './pendingWithdrawals';

function setup() {
	const values = new Map<string, string>();
	const log: string[] = [];
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			log.push('store');
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		}
	};
	const account = algosdk.generateAccount();
	const txns = [100, 95].map((lastValid, i) =>
		algosdk.makePaymentTxnWithSuggestedParamsFromObject({
			sender: account.addr,
			receiver: account.addr,
			amount: i + 1,
			suggestedParams: {
				fee: 1000,
				minFee: 1000,
				flatFee: true,
				firstValid: 1,
				lastValid,
				genesisID: 'voimain-v1.0',
				genesisHash: new Uint8Array(32)
			}
		})
	);
	algosdk.assignGroupID(txns);
	const signed = txns.map((txn) => txn.signTxn(account.sk));
	const input = { wallet: account.addr.toString(), contractId: 123, txns };
	const sign = vi.fn(async (): Promise<Uint8Array[] | null | undefined> => signed);
	const send = vi.fn(async () => {
		log.push('send');
		return {};
	});
	const waitForConfirmation = vi.fn(async (): Promise<{ 'confirmed-round'?: number }> => ({}));
	const deps = { sign, send: { send, waitForConfirmation }, storage, now: () => 1234 };
	const read = () => getPendingWithdrawal(input.wallet, input.contractId, storage);
	const entry = { txId: txns[0].txID(), lastValid: 95, createdAt: 1234 };
	return { input, deps, sign, send, waitForConfirmation, storage, log, read, entry };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

// algosdk 3 keeps the HTTP status on error.response, with the raw body as bytes.
const v3Status = (status: number) => ({
	response: { status, body: new Uint8Array(), headers: {} }
});

const algosdkPrefixFor = (status: number) =>
	`Network request error. Received status ${status} (Bad Request)`;

describe('sendWithdrawal', () => {
	it('does not store or send when signing throws', async () => {
		const d = setup();
		d.sign.mockRejectedValue(new Error('user cancelled'));
		expect(await sendWithdrawal(d.input, d.deps)).toEqual({
			status: 'not-signed',
			error: 'user cancelled'
		});
		expect(d.read()).toBeUndefined();
		expect(d.log).toEqual([]);
		expect(d.send).not.toHaveBeenCalled();
	});

	it.each([null, undefined, []])(
		'does not store or send for an empty signature result: %s',
		async (signed) => {
			const d = setup();
			d.sign.mockResolvedValue(signed);
			expect(await sendWithdrawal(d.input, d.deps)).toEqual({
				status: 'not-signed',
				error: 'Signature was rejected'
			});
			expect(d.read()).toBeUndefined();
			expect(d.send).not.toHaveBeenCalled();
		}
	);

	it('stores the first signed txid and earliest expiry BEFORE broadcasting', async () => {
		const d = setup();
		d.send.mockImplementation(async () => {
			expect(d.read()).toEqual(d.entry);
			d.log.push('send');
			return {};
		});
		expect(await sendWithdrawal(d.input, d.deps)).toEqual({
			status: 'pending',
			txId: d.entry.txId,
			lastValid: 95
		});
		expect(d.sign).toHaveBeenCalledWith([d.input.txns]);
		expect(d.log).toEqual(['store', 'send']);
		expect(d.read()).toEqual(d.entry);
	});

	it('clears on a 4xx submit refusal', async () => {
		const d = setup();
		d.send.mockRejectedValue(Object.assign(new Error('refused'), v3Status(400)));
		expect(await sendWithdrawal(d.input, d.deps)).toEqual({
			status: 'rejected',
			txId: d.entry.txId,
			error: 'refused'
		});
		expect(d.read()).toBeUndefined();
		expect(d.waitForConfirmation).not.toHaveBeenCalled();
	});

	it.each(['overspend', 'transaction rejected'])(
		'clears a clean algod 400: %s',
		async (message) => {
			const d = setup();
			d.send.mockRejectedValue(Object.assign(new Error(message), v3Status(400)));
			expect(await sendWithdrawal(d.input, d.deps)).toEqual({
				status: 'rejected',
				txId: d.entry.txId,
				error: message
			});
			expect(d.read()).toBeUndefined();
		}
	);

	it.each([
		{ response: { status: 400 }, message: 'transaction already in ledger' },
		{ response: { status: 400 }, message: 'already in pool' },
		{ response: { status: 400 }, message: 'already in the ledger' },
		{ response: { status: 400 }, message: 'already been committed' },
		{ response: { status: 400 }, message: 'already confirmed' },
		{ response: { status: 400 }, message: 'already submitted' },
		{ response: { status: 400 }, message: 'Duplicate transaction' },
		{ response: { status: 400 }, message: '' },
		{ response: { status: 400 }, message: '   ' },
		{ response: { status: 400 } },
		{ response: { status: 400 }, message: 123 },
		...[408, 429, 499, 404, 401, 413].map((status) => ({
			response: { status },
			message: 'transaction rejected'
		})),
		{ message: 'transaction rejected' },
		{ response: { status: '400' }, message: 'transaction rejected' },
		// algosdk 3 keeps the body as bytes: a message that is only in the body is not evidence.
		{
			response: {
				status: 400,
				body: new TextEncoder().encode('{"message":"already in pool"}')
			}
		},
		{ response: { status: 400, text: 'transaction already in ledger' } }
	])('keeps the hold for an ambiguous submit error: %j', async (error) => {
		const d = setup();
		d.send.mockRejectedValue(error);
		expect(await sendWithdrawal(d.input, d.deps)).toEqual({
			status: 'pending',
			txId: d.entry.txId,
			lastValid: 95
		});
		expect(d.read()).toEqual(d.entry);
		expect(d.waitForConfirmation).not.toHaveBeenCalled();
	});

	// A proxy can answer 400 with a JSON body that has no `message` key; response.text then holds the
	// raw body. algosdk puts the algod text into error.message only when the body had a `message`,
	// so the raw text is not evidence of an algod rejection.
	it.each([
		{ message: '', response: { status: 400, text: '{"error":"bad gateway config"}' } },
		{ message: '', response: { status: 400, text: 'transaction rejected' } },
		{ message: algosdkPrefixFor(400), response: { status: 400, text: '{}' } },
		{
			message: algosdkPrefixFor(400),
			response: {
				status: 400,
				text: '{"error":"x"}',
				body: new TextEncoder().encode('{"error":"x"}')
			}
		}
	])('keeps the hold when only response.text carries something: %j', async (error) => {
		const d = setup();
		d.send.mockRejectedValue(error);
		expect(await sendWithdrawal(d.input, d.deps)).toEqual({
			status: 'pending',
			txId: d.entry.txId,
			lastValid: 95
		});
		expect(d.read()).toEqual(d.entry);
	});

	// Ordinary algod rejections must release immediately: a wider net would hold the contract for the
	// whole validity window for a transaction that never landed.
	it.each([
		'asset 123 does not exist',
		'application 456 does not exist',
		'account already opted in to asset 7',
		'logic eval error: assert failed; already withdrawn this epoch',
		'TransactionPool.Remember: transaction TXID: account ADDR balance 5 below min 100000'
	])('releases an ordinary algod rejection: %s', async (message) => {
		const d = setup();
		d.send.mockRejectedValue(
			Object.assign(new Error(`${algosdkPrefixFor(400)}: ${message}`), v3Status(400))
		);
		expect(await sendWithdrawal(d.input, d.deps)).toMatchObject({ status: 'rejected' });
		expect(d.read()).toBeUndefined();
	});

	it.each([
		'transaction already exists',
		'txn already in the transaction pool',
		'transaction TXID exists in the ledger',
		'transaction already in ledger: TXID',
		'duplicate transaction',
		'already been committed'
	])('keeps the hold when the transaction itself exists: %s', async (message) => {
		const d = setup();
		d.send.mockRejectedValue(
			Object.assign(new Error(`${algosdkPrefixFor(400)}: ${message}`), v3Status(400))
		);
		expect(await sendWithdrawal(d.input, d.deps)).toMatchObject({ status: 'pending' });
		expect(d.read()).toEqual(d.entry);
	});

	// Real algosdk errors always carry a non-empty message: the status prefix, plus the algod body
	// text only when the response had a JSON body with a message.
	const algosdkPrefix = 'Network request error. Received status 400 (Bad Request)';
	it.each([
		algosdkPrefix,
		`${algosdkPrefix}: `,
		`${algosdkPrefix}:   `,
		`${algosdkPrefix}: transaction already in ledger: TXID`,
		`${algosdkPrefix}: txgroup already in transaction pool`,
		`${algosdkPrefix}: transaction exists in the pool`,
		`${algosdkPrefix}: already included`
	])('keeps the hold for the algosdk error %j (a bare prefix proves nothing)', async (message) => {
		const d = setup();
		d.send.mockRejectedValue(Object.assign(new Error(message), v3Status(400)));
		expect(await sendWithdrawal(d.input, d.deps)).toEqual({
			status: 'pending',
			txId: d.entry.txId,
			lastValid: 95
		});
		expect(d.read()).toEqual(d.entry);
	});

	it.each([
		`${algosdkPrefix}: TransactionPool.Remember: transaction TXID: overspend`,
		`${algosdkPrefix}: transaction rejected by logic`
	])('clears an algosdk 400 that carries an algod rejection: %j', async (message) => {
		const d = setup();
		d.send.mockRejectedValue(Object.assign(new Error(message), v3Status(400)));
		expect(await sendWithdrawal(d.input, d.deps)).toMatchObject({ status: 'rejected' });
		expect(d.read()).toBeUndefined();
	});

	// The shape algosdk 3 really throws for an algod 400 with a JSON message: the text is in
	// error.message, the status is on error.response, and the body is the raw bytes.
	it('clears a real algosdk 3 400 and keeps its error text', async () => {
		const d = setup();
		const error = Object.assign(new Error(`${algosdkPrefixFor(400)}: overspend`), {
			response: {
				status: 400,
				body: new TextEncoder().encode('{"message":"overspend"}'),
				headers: {}
			}
		});
		d.send.mockRejectedValue(error);
		expect(await sendWithdrawal(d.input, d.deps)).toEqual({
			status: 'rejected',
			txId: d.entry.txId,
			error: error.message
		});
		expect(d.read()).toBeUndefined();
	});

	it('passes the original submit error unchanged to sendAndConfirm', async () => {
		const d = setup();
		const error = Object.assign(new Error('overspend'), v3Status(400));
		d.send.mockRejectedValue(error);
		const original = sending.sendAndConfirm;
		vi.spyOn(sending, 'sendAndConfirm').mockImplementation(async (signed, deps) => {
			await expect(deps.send(signed)).rejects.toBe(error);
			return original(signed, deps);
		});
		expect(await sendWithdrawal(d.input, d.deps)).toEqual({
			status: 'rejected',
			txId: d.entry.txId,
			error: 'overspend'
		});
	});

	it.each(['different', 'reordered', 'shorter'])(
		'rejects a %s signed group before recording or broadcasting',
		async (kind) => {
			const d = setup();
			const signed = await d.sign();
			const other = setup();
			d.sign.mockResolvedValue(
				kind === 'different'
					? await other.sign()
					: kind === 'reordered'
						? [...signed!].reverse()
						: signed!.slice(0, 1)
			);
			expect(await sendWithdrawal(d.input, d.deps)).toEqual({
				status: 'not-signed',
				error: 'The wallet returned a different transaction group, so nothing was sent.'
			});
			expect(d.send).not.toHaveBeenCalled();
			expect(d.log).toEqual([]);
			expect(d.read()).toBeUndefined();
		}
	);

	it('accepts the same txids in the requested order', async () => {
		const d = setup();
		expect(await sendWithdrawal(d.input, d.deps)).toMatchObject({ status: 'pending' });
		expect(d.send).toHaveBeenCalledOnce();
		expect(d.read()).toEqual(d.entry);
	});

	it('skips group identity checks for inputs without txID', async () => {
		const d = setup();
		expect(await sendWithdrawal({ ...d.input, txns: [{}, {}] }, d.deps)).toMatchObject({
			status: 'pending'
		});
		expect(d.send).toHaveBeenCalledOnce();
		expect(d.read()).toEqual(d.entry);
	});

	it('clears on confirmation', async () => {
		const d = setup();
		d.waitForConfirmation.mockResolvedValue({ 'confirmed-round': 20 });
		expect(await sendWithdrawal(d.input, d.deps)).toEqual({
			status: 'confirmed',
			txId: d.entry.txId,
			confirmedRound: 20
		});
		expect(d.read()).toBeUndefined();
	});

	it.each([
		'network submit error',
		'wait throws',
		'no confirmed round',
		'unexpected plumbing throw',
		'timeout'
	])('keeps the record for %s', async (failure) => {
		const d = setup();
		if (failure === 'network submit error') d.send.mockRejectedValue(new Error('offline'));
		if (failure === 'wait throws')
			d.waitForConfirmation.mockRejectedValue(new Error('lookup failed'));
		if (failure === 'unexpected plumbing throw')
			vi.spyOn(sending, 'sendAndConfirm').mockRejectedValue(new Error('unexpected'));
		if (failure === 'timeout') {
			vi.useFakeTimers();
			d.waitForConfirmation.mockImplementation(
				() => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
			);
		}
		const result = sendWithdrawal(d.input, d.deps);
		if (failure === 'timeout') await vi.advanceTimersByTimeAsync(10000);
		expect(await result).toEqual({ status: 'pending', txId: d.entry.txId, lastValid: 95 });
		expect(d.read()).toEqual(d.entry);
	});

	it('does not send or record malformed signed data', async () => {
		const d = setup();
		d.sign.mockResolvedValue([new Uint8Array([1, 2, 3])]);
		expect(await sendWithdrawal(d.input, d.deps)).toMatchObject({
			status: 'not-signed',
			error: expect.any(String)
		});
		expect(d.read()).toBeUndefined();
		expect(d.send).not.toHaveBeenCalled();
	});

	it('discards signed data when storage throws and NEVER broadcasts', async () => {
		const d = setup();
		d.storage.setItem = () => {
			throw new Error('quota exceeded');
		};
		expect(await sendWithdrawal(d.input, d.deps)).toEqual({
			status: 'not-recorded',
			error: "Couldn't save the pending withdrawal, so nothing was sent."
		});
		expect(d.read()).toBeUndefined();
		expect(d.send).not.toHaveBeenCalled();
	});

	it('does not erase a newer record when an older send confirms', async () => {
		const d = setup();
		d.waitForConfirmation.mockImplementation(async () => {
			rememberPendingWithdrawal(
				d.input.wallet,
				d.input.contractId,
				{ ...d.entry, txId: 'NEW' },
				d.storage
			);
			return { 'confirmed-round': 20 };
		});
		await sendWithdrawal(d.input, d.deps);
		expect(d.read()?.txId).toBe('NEW');
	});
});

describe('canOfferWithdraw', () => {
	it('offers only an idle withdrawal with a known wallet and no record', () => {
		const d = setup();
		const input = {
			status: 'idle',
			wallet: d.input.wallet,
			contractId: d.input.contractId,
			storage: d.storage
		};
		expect(canOfferWithdraw(input)).toBe(true);
		for (const status of ['building', 'signing', 'confirming', 'pending', 'confirmed', 'error'])
			expect(canOfferWithdraw({ ...input, status })).toBe(false);
		for (const wallet of [undefined, ''])
			expect(canOfferWithdraw({ ...input, wallet })).toBe(false);
		// A second caller uses the same storage, as another tab does.
		rememberPendingWithdrawal(input.wallet, input.contractId, d.entry, { ...d.storage });
		expect(canOfferWithdraw(input)).toBe(false);
		expect(canOfferWithdraw({ ...input, contractId: 456 })).toBe(true);
		expect(canOfferWithdraw({ ...input, wallet: 'another' })).toBe(true);
	});

	it('treats corrupt storage as no record', () => {
		const d = setup();
		d.storage.setItem(pendingWithdrawalStorageKey(d.input.wallet, d.input.contractId), 'bad JSON');
		expect(canOfferWithdraw({ status: 'idle', ...d.input, storage: d.storage })).toBe(true);
	});
});

describe('sendWithdrawal: wallet pinning and a record from another tab', () => {
	it('signs nothing when the connected wallet changed after the form was submitted', async () => {
		const d = setup();
		const outcome = await sendWithdrawal(d.input, { ...d.deps, currentWallet: () => 'another' });
		expect(outcome.status).toBe('not-signed');
		expect(d.sign).not.toHaveBeenCalled();
		expect(d.send).not.toHaveBeenCalled();
		expect(d.read()).toBeUndefined();
	});

	it('records and sends nothing when the wallet changed while the signing prompt was open', async () => {
		const d = setup();
		let current = d.input.wallet;
		const signed = await d.sign();
		d.sign.mockImplementation(async () => {
			current = 'another';
			return signed;
		});
		const outcome = await sendWithdrawal(d.input, { ...d.deps, currentWallet: () => current });
		expect(outcome.status).toBe('not-signed');
		expect(d.send).not.toHaveBeenCalled();
		expect(d.read()).toBeUndefined();
	});

	it('still sends when the connected wallet is the one captured at submit', async () => {
		const d = setup();
		const outcome = await sendWithdrawal(d.input, {
			...d.deps,
			currentWallet: () => d.input.wallet
		});
		expect(outcome.status).not.toBe('not-signed');
		expect(d.send).toHaveBeenCalledTimes(1);
	});

	it('does not overwrite or broadcast over a live record for another transaction', async () => {
		const d = setup();
		const other = { txId: 'OTHERTX', lastValid: 500, createdAt: 1 };
		rememberPendingWithdrawal(d.input.wallet, d.input.contractId, other, d.storage);
		const outcome = await sendWithdrawal(d.input, d.deps);
		expect(outcome.status).toBe('not-recorded');
		expect(d.send).not.toHaveBeenCalled();
		expect(d.read()).toEqual(other);
	});

	it('reads the live record and writes its own inside one cross-tab lock', async () => {
		const d = setup();
		let held = false;
		const seen: string[] = [];
		const storage = {
			getItem: (key: string) => {
				seen.push(`get:${held}`);
				return d.storage.getItem(key);
			},
			setItem: (key: string, value: string) => {
				seen.push(`set:${held}`);
				d.storage.setItem(key, value);
			},
			removeItem: (key: string) => d.storage.removeItem(key)
		};
		let lockCalls = 0;
		async function lock<T>(run: () => T): Promise<T> {
			lockCalls++;
			held = true;
			try {
				return run();
			} finally {
				held = false;
			}
		}
		await sendWithdrawal(d.input, { ...d.deps, storage, lock });
		expect(lockCalls).toBe(1);
		expect(seen).toContain('get:true');
		expect(seen).toContain('set:true');
		expect(seen.filter((entry) => entry.endsWith(':false'))).toEqual([]);
	});

	it('sends nothing when the cross-tab lock cannot be taken', async () => {
		const d = setup();
		async function lock<T>(): Promise<T> {
			throw new Error('locks unavailable');
		}
		const outcome = await sendWithdrawal(d.input, { ...d.deps, lock });
		expect(outcome.status).toBe('not-recorded');
		expect(d.send).not.toHaveBeenCalled();
		expect(d.read()).toBeUndefined();
	});

	it('sends nothing when a lock resolves without ever running the record step', async () => {
		const d = setup();
		async function lock<T>(): Promise<T> {
			return undefined as T;
		}
		const outcome = await sendWithdrawal(d.input, { ...d.deps, lock });
		expect(outcome.status).toBe('not-recorded');
		expect(d.send).not.toHaveBeenCalled();
		expect(d.read()).toBeUndefined();
	});

	it('takes the real navigator.locks lock by name and runs the record step inside it', async () => {
		const d = setup();
		const requested: string[] = [];
		let held = false;
		const seen: string[] = [];
		const storage = {
			getItem: (key: string) => {
				seen.push(`get:${held}`);
				return d.storage.getItem(key);
			},
			setItem: (key: string, value: string) => {
				seen.push(`set:${held}`);
				d.storage.setItem(key, value);
			},
			removeItem: (key: string) => d.storage.removeItem(key)
		};
		vi.stubGlobal('navigator', {
			locks: {
				request: async (name: string, run: () => Promise<unknown>) => {
					requested.push(name);
					held = true;
					try {
						return await run();
					} finally {
						held = false;
					}
				}
			}
		});
		try {
			await sendWithdrawal(d.input, { ...d.deps, storage });
		} finally {
			vi.unstubAllGlobals();
		}
		expect(requested).toEqual(['voirewards:pending-withdrawal']);
		expect(seen).toContain('set:true');
		expect(seen.filter((entry) => entry.endsWith(':false'))).toEqual([]);
		expect(d.send).toHaveBeenCalledTimes(1);
	});
});
