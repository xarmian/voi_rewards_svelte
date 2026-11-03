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
	const txns = [100, 95].map((lastRound, i) =>
		algosdk.makePaymentTxnWithSuggestedParamsFromObject({
			from: account.addr,
			to: account.addr,
			amount: i + 1,
			suggestedParams: {
				fee: 1000,
				flatFee: true,
				firstRound: 1,
				lastRound,
				genesisID: 'voimain-v1.0',
				genesisHash: Buffer.alloc(32).toString('base64')
			}
		})
	);
	algosdk.assignGroupID(txns);
	const signed = txns.map((txn) => txn.signTxn(account.sk));
	const input = { wallet: account.addr, contractId: 123, txns };
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
		d.send.mockRejectedValue(Object.assign(new Error('refused'), { status: 400 }));
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
			d.send.mockRejectedValue(Object.assign(new Error(message), { status: 400 }));
			expect(await sendWithdrawal(d.input, d.deps)).toEqual({
				status: 'rejected',
				txId: d.entry.txId,
				error: message
			});
			expect(d.read()).toBeUndefined();
		}
	);

	it.each([
		{ status: 400, message: 'transaction already in ledger' },
		{ status: 400, message: 'already in pool' },
		{ status: 400, message: 'already in the ledger' },
		{ status: 400, message: 'already been committed' },
		{ status: 400, message: 'already confirmed' },
		{ status: 400, message: 'already submitted' },
		{ status: 400, message: 'Duplicate transaction' },
		{ status: 400, message: '' },
		{ status: 400, message: '   ' },
		{ status: 400 },
		{ status: 400, message: 123 },
		...[408, 429, 499, 404, 401, 413].map((status) => ({
			status,
			message: 'transaction rejected'
		})),
		{ message: 'transaction rejected' },
		{ status: '400', message: 'transaction rejected' },
		{ status: 400, response: { body: { message: 'already in pool' } } },
		{ status: 400, response: { text: 'transaction already in ledger' } },
		{ status: 400, message: 'Bad Request', response: { body: { message: 'duplicate' } } },
		{ status: 400, message: 'Bad Request', response: { text: 'already confirmed' } }
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

	it.each([
		{ status: 400, response: { body: { message: 'overspend' } } },
		{ status: 400, message: '', response: { text: 'transaction rejected' } }
	])('recognizes nested clean messages and preserves shared error text: %j', async (error) => {
		const d = setup();
		d.send.mockRejectedValue(error);
		expect(await sendWithdrawal(d.input, d.deps)).toEqual({
			status: 'rejected',
			txId: d.entry.txId,
			error: String(error)
		});
		expect(d.read()).toBeUndefined();
	});

	it('passes the original submit error unchanged to sendAndConfirm', async () => {
		const d = setup();
		const error = Object.assign(new Error('overspend'), { status: 400 });
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
