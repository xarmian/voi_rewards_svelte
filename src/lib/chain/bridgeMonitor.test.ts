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
	const afterTime = '2026-11-02T12:34:26.789Z';
	it('finds the first matching deposit without ever requesting health', async () => {
		const deps = fake({ transactions: [deposit()] });
		expect(await checkAlgorandDeposit(deps, depositExpected, afterTime, signal)).toEqual({
			done: true,
			tx: { id: 'DEPOSIT' }
		});
		const urls = deps.getJson.mock.calls.map(([url]) => url);
		expect(urls).toEqual([
			`https://mainnet-idx.4160.nodely.dev/v2/transactions?note-prefix=${encodeURIComponent(btoa('aramid-transfer/v1:j'))}&after-time=${encodeURIComponent(afterTime)}&limit=10`
		]);
		expect(urls.some((url) => url.includes('/health'))).toBe(false);
		expect(deps.getJson).toHaveBeenCalledWith(urls[0], signal);
	});
	it('returns not done for a non-matching list', async () => {
		expect(
			await checkAlgorandDeposit(
				fake({ transactions: [null, {}, { ...deposit(), sender: 'OTHER' }] }),
				depositExpected,
				afterTime,
				signal
			)
		).toEqual({ done: false });
	});
	it.each([null, {}, { transactions: null }, { transactions: {} }])(
		'rejects unreadable transaction response %#',
		async (response) => {
			await expect(
				checkAlgorandDeposit(fake(response), depositExpected, afterTime, signal)
			).rejects.toThrow('Unexpected indexer response');
		}
	);
	it('skips a match without a string id and keeps searching', async () => {
		expect(
			await checkAlgorandDeposit(
				fake({ transactions: [{ ...deposit(), id: undefined }, deposit()] }),
				depositExpected,
				afterTime,
				signal
			)
		).toEqual({ done: true, tx: { id: 'DEPOSIT' } });
	});
	it('propagates transaction errors', async () => {
		const error = new Error('offline');
		await expect(
			checkAlgorandDeposit(
				{ getJson: vi.fn().mockRejectedValue(error) },
				depositExpected,
				afterTime,
				signal
			)
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
				fake({ transactions: [deposit()] }),
				{ ...depositExpected, ...change },
				afterTime,
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
