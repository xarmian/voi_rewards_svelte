import { describe, expect, it, vi } from 'vitest';
import {
	confirmationUrl,
	checkDestinationConfirmation,
	checkAlgorandDeposit,
	matchBridgeDeposit
} from './bridgeMonitor';
import type { ExpectedBridgeConfirmation } from './bridgeConfirmation';

const indexer = 'https://indexer.example';
const signal = new AbortController().signal;
const expected: ExpectedBridgeConfirmation = {
	sourceTxId: 'SOURCE',
	sourceNetwork: 416101,
	bridgeAddress: 'BRIDGE',
	destinationAddress: 'DESTINATION',
	destinationAssetId: '123',
	destinationAmount: 1000n
};
const confirmationNote = (sourceTxId = 'SOURCE') =>
	btoa('aramid-confirm/v1:j' + JSON.stringify({ sourceTxId, sourceNetwork: 416101 }));
const confirmation = () => ({
	id: 'CONFIRMED',
	sender: 'BRIDGE',
	'tx-type': 'axfer',
	note: confirmationNote(),
	'asset-transfer-transaction': { 'asset-id': 123, receiver: 'DESTINATION', amount: 1000 }
});
const depositExpected = {
	assetId: 123,
	bridgeAddress: 'BRIDGE',
	amount: 1000n,
	destinationAddress: 'DESTINATION',
	sourceAddress: 'SENDER'
};
const deposit = () => ({
	id: 'DEPOSIT',
	sender: 'SENDER',
	'tx-type': 'axfer',
	note: btoa('aramid-transfer/v1:j' + JSON.stringify({ destinationAddress: 'DESTINATION' })),
	'asset-transfer-transaction': { 'asset-id': 123, receiver: 'BRIDGE', amount: 1000 }
});
const fake = (response: unknown) => ({ getJson: vi.fn().mockResolvedValue(response) });
const check = (transactions: unknown[]) =>
	checkDestinationConfirmation(fake({ transactions }), indexer, expected, signal);

describe('destination confirmation', () => {
	it('queries 50 confirmations for the destination with the encoded base64 prefix', () => {
		expect(confirmationUrl(indexer, 'DESTINATION')).toBe(
			`${indexer}/v2/transactions?note-prefix=${encodeURIComponent(btoa('aramid-confirm/v1:j'))}&address=DESTINATION&limit=50`
		);
	});
	it('returns not done for a non-matching list', async () => {
		expect(await check([null, {}, { ...confirmation(), sender: 'OTHER' }])).toEqual({
			done: false
		});
	});
	it('finds a matching axfer after wrong sender, receiver, asset and source transaction', async () => {
		const tx = confirmation();
		expect(
			await check([
				{ ...tx, sender: 'OTHER' },
				{
					...tx,
					'asset-transfer-transaction': { ...tx['asset-transfer-transaction'], receiver: 'OTHER' }
				},
				{
					...tx,
					'asset-transfer-transaction': { ...tx['asset-transfer-transaction'], 'asset-id': 124 }
				},
				{ ...tx, note: confirmationNote('OTHER') },
				tx
			])
		).toEqual({ done: true, tx: { id: 'CONFIRMED' } });
	});
	it('requires a string transaction id before reporting done', async () => {
		expect(
			await check([
				{ ...confirmation(), id: undefined },
				{ ...confirmation(), id: 3 }
			])
		).toEqual({ done: false });
	});
	it('reports review, never done, for the right transfer with a different amount', async () => {
		const tx = confirmation();
		tx['asset-transfer-transaction'].amount = 999;
		expect(await check([tx])).toEqual({ done: false, review: { expected: 1000n, actual: 999n } });
	});
	it('prefers a later true match over an earlier amount mismatch', async () => {
		const tx = confirmation();
		tx['asset-transfer-transaction'].amount = 999;
		expect(await check([tx, confirmation()])).toEqual({ done: true, tx: { id: 'CONFIRMED' } });
	});
	it('accepts a native payment match', async () => {
		const tx = {
			...confirmation(),
			'tx-type': 'pay',
			'payment-transaction': { receiver: 'DESTINATION', amount: 1000 }
		};
		expect(
			await checkDestinationConfirmation(
				fake({ transactions: [tx] }),
				indexer,
				{ ...expected, destinationAssetId: '0' },
				signal
			)
		).toEqual({ done: true, tx: { id: 'CONFIRMED' } });
	});
	it.each([null, [], {}, { transactions: null }, { transactions: {} }, { transactions: 'bad' }])(
		'rejects unreadable indexer response %#',
		async (response) => {
			await expect(
				checkDestinationConfirmation(fake(response), indexer, expected, signal)
			).rejects.toThrow('Unexpected indexer response');
		}
	);
	it('treats an empty transactions array as not yet confirmed', async () => {
		expect(await check([])).toEqual({ done: false });
	});
	it('propagates getJson rejection', async () => {
		const error = new Error('HTTP 503');
		await expect(
			checkDestinationConfirmation(
				{ getJson: vi.fn().mockRejectedValue(error) },
				indexer,
				expected,
				signal
			)
		).rejects.toBe(error);
	});
	it('passes the supplied signal to getJson', async () => {
		const deps = fake({ transactions: [] });
		await checkDestinationConfirmation(deps, indexer, expected, signal);
		expect(deps.getJson).toHaveBeenCalledWith(confirmationUrl(indexer, 'DESTINATION'), signal);
	});
});

describe('Algorand deposit', () => {
	const algodBase = 'https://algod.example';
	const indexerBase = 'https://indexer.example';
	const state = () => ({ startRound: null as number | null, startedAtMs: 100 });
	const query = (round: number) =>
		`${indexerBase}/v2/transactions?note-prefix=${encodeURIComponent(btoa('aramid-transfer/v1:j'))}&min-round=${round}&limit=50`;
	function deps(response: unknown = { transactions: [] }, elapsed = 0, lastRound = 100) {
		return {
			algodBase,
			indexerBase,
			nowMs: vi.fn(() => 100 + elapsed),
			getJson: vi.fn(
				async (url: string, _signal: AbortSignal): Promise<unknown> =>
					url === `${algodBase}/v2/status` ? { 'last-round': lastRound } : response
			)
		};
	}
	it.each([
		[100, 0, 98],
		[100, 5000, 95],
		[3, 5000, 0]
	])('starts from algod round %s with elapsed %s at min-round %s', async (round, elapsed, min) => {
		const d = deps({ transactions: [] }, elapsed, round);
		const window = state();
		expect(await checkAlgorandDeposit(d, depositExpected, window, signal)).toEqual({ done: false });
		expect(window.startRound).toBe(min);
		expect(d.getJson.mock.calls.map(([url]) => url)).toEqual([
			`${algodBase}/v2/status`,
			query(min)
		]);
		for (const [url, requestSignal] of d.getJson.mock.calls) {
			expect(url).not.toContain('after-time');
			expect(url).not.toContain('/health');
			expect(requestSignal).toBe(signal);
		}
	});
	it('finds a deposit already present on the first call', async () => {
		const d = deps({ transactions: [deposit()] });
		expect(await checkAlgorandDeposit(d, depositExpected, state(), signal)).toEqual({
			done: true,
			tx: { id: 'DEPOSIT' }
		});
		expect(d.getJson.mock.calls.map(([url]) => url)).toEqual([`${algodBase}/v2/status`, query(98)]);
	});
	it('keeps an established boundary without asking algod again', async () => {
		const d = deps();
		const window = { startRound: 75, startedAtMs: 100 };
		await checkAlgorandDeposit(d, depositExpected, window, signal);
		d.nowMs.mockReturnValue(90000);
		await checkAlgorandDeposit(d, depositExpected, window, signal);
		expect(window.startRound).toBe(75);
		expect(d.getJson.mock.calls.map(([url]) => url)).toEqual([query(75), query(75)]);
		expect(d.nowMs).not.toHaveBeenCalled();
	});
	it('reaches back to QR start after algod recovers from an initial failure', async () => {
		const d = deps();
		const error = new Error('offline');
		d.getJson.mockRejectedValueOnce(error);
		const window = state();
		await expect(checkAlgorandDeposit(d, depositExpected, window, signal)).rejects.toBe(error);
		expect(window.startRound).toBeNull();
		d.nowMs.mockReturnValue(5100);
		await checkAlgorandDeposit(d, depositExpected, window, signal);
		expect(window.startRound).toBe(95);
		expect(d.getJson.mock.calls.map(([url]) => url)).toEqual([
			`${algodBase}/v2/status`,
			`${algodBase}/v2/status`,
			query(95)
		]);
	});
	it.each([NaN, Infinity, -Infinity, -1, 1.5, '100', undefined])(
		'rejects an invalid algod last-round: %s',
		async (round) => {
			const d = deps();
			d.getJson.mockResolvedValueOnce({ 'last-round': round });
			const window = state();
			await expect(checkAlgorandDeposit(d, depositExpected, window, signal)).rejects.toThrow(
				'Unexpected algod response'
			);
			expect(window.startRound).toBeNull();
		}
	);
	it('follows an encoded next-token and finds the first match on page two', async () => {
		const d = deps();
		d.getJson
			.mockResolvedValueOnce({ transactions: [], 'next-token': 'page+2/=' })
			.mockResolvedValueOnce({ transactions: [deposit(), { ...deposit(), id: 'SECOND' }] });
		expect(
			await checkAlgorandDeposit(d, depositExpected, { ...state(), startRound: 98 }, signal)
		).toEqual({ done: true, tx: { id: 'DEPOSIT' } });
		expect(d.getJson.mock.calls.map(([url]) => url)).toEqual([
			query(98),
			`${query(98)}&next=page%2B2%2F%3D`
		]);
	});
	it('stops after three pages even with another next-token', async () => {
		const d = deps();
		d.getJson
			.mockResolvedValueOnce({ transactions: [], 'next-token': 'two' })
			.mockResolvedValueOnce({ transactions: [], 'next-token': 'three' })
			.mockResolvedValueOnce({ transactions: [], 'next-token': 'four' })
			.mockResolvedValueOnce({ transactions: [deposit()] });
		expect(
			await checkAlgorandDeposit(d, depositExpected, { ...state(), startRound: 98 }, signal)
		).toEqual({ done: false });
		expect(d.getJson.mock.calls.map(([url]) => url)).toEqual([
			query(98),
			`${query(98)}&next=two`,
			`${query(98)}&next=three`
		]);
	});
	it('returns not done for a non-matching list', async () => {
		expect(
			await checkAlgorandDeposit(
				deps({ transactions: [null, {}, { ...deposit(), sender: 'OTHER' }] }),
				depositExpected,
				state(),
				signal
			)
		).toEqual({ done: false });
	});
	it.each([null, {}, { transactions: null }, { transactions: {} }])(
		'rejects unreadable transaction response %#',
		async (response) => {
			await expect(
				checkAlgorandDeposit(deps(response), depositExpected, state(), signal)
			).rejects.toThrow('Unexpected indexer response');
		}
	);
	it('validates the transactions array on later pages too', async () => {
		const d = deps();
		d.getJson
			.mockResolvedValueOnce({ transactions: [], 'next-token': 'two' })
			.mockResolvedValueOnce({});
		await expect(
			checkAlgorandDeposit(d, depositExpected, { ...state(), startRound: 98 }, signal)
		).rejects.toThrow('Unexpected indexer response');
	});
	it('skips a match without a string id and keeps searching', async () => {
		expect(
			await checkAlgorandDeposit(
				deps({ transactions: [{ ...deposit(), id: undefined }, deposit()] }),
				depositExpected,
				state(),
				signal
			)
		).toEqual({ done: true, tx: { id: 'DEPOSIT' } });
	});
	it('propagates transaction errors', async () => {
		const d = deps();
		const error = new Error('offline');
		d.getJson.mockRejectedValueOnce(error);
		await expect(
			checkAlgorandDeposit(d, depositExpected, { ...state(), startRound: 98 }, signal)
		).rejects.toBe(error);
	});
	it.each([
		{ assetId: 124 },
		{ bridgeAddress: 'OTHER' },
		{ amount: 999n },
		{ destinationAddress: 'OTHER' },
		{ sourceAddress: 'OTHER' }
	])('rejects deposits with incorrect expectations %#', async (change) => {
		expect(
			await checkAlgorandDeposit(
				deps({ transactions: [deposit()] }),
				{ ...depositExpected, ...change },
				state(),
				signal
			)
		).toEqual({ done: false });
	});
});

describe('matchBridgeDeposit', () => {
	it.each([1000n, 1000, '1000'])('compares integer atomic amounts using bigint: %s', (amount) => {
		expect(matchBridgeDeposit(deposit(), { ...depositExpected, amount })).toBe(true);
	});
	it('allows any sender only when sourceAddress is omitted', () => {
		expect(
			matchBridgeDeposit(
				{ ...deposit(), sender: 'OTHER' },
				{ ...depositExpected, sourceAddress: undefined }
			)
		).toBe(true);
	});
	it('requires axfer and numeric asset id', () => {
		expect(matchBridgeDeposit({ ...deposit(), 'tx-type': 'pay' }, depositExpected)).toBe(false);
		expect(
			matchBridgeDeposit(
				{
					...deposit(),
					'asset-transfer-transaction': { 'asset-id': '123', receiver: 'BRIDGE', amount: 1000 }
				},
				depositExpected
			)
		).toBe(false);
	});
	it.each([1.5, NaN, Infinity, '1.5', '', ' ', null, undefined, true, {}])(
		'rejects invalid integer amount %#',
		(amount) => {
			expect(
				matchBridgeDeposit(
					{
						...deposit(),
						'asset-transfer-transaction': { ...deposit()['asset-transfer-transaction'], amount }
					},
					depositExpected
				)
			).toBe(false);
			expect(matchBridgeDeposit(deposit(), { ...depositExpected, amount: amount as never })).toBe(
				false
			);
		}
	);
	it.each([
		null,
		undefined,
		3,
		[],
		{},
		{ note: 'bad!' },
		{ ...deposit(), note: btoa('aramid-transfer/v1:j{') },
		{ ...deposit(), note: btoa('wrong-prefix{}') },
		Object.defineProperty({}, 'note', {
			get() {
				throw new Error('hostile');
			}
		}),
		new Proxy(
			{},
			{
				get() {
					throw new Error('hostile');
				}
			}
		)
	])('never throws on hostile input %#', (tx) => {
		expect(() => matchBridgeDeposit(tx, depositExpected)).not.toThrow();
		expect(matchBridgeDeposit(tx, depositExpected)).toBe(false);
	});
});
