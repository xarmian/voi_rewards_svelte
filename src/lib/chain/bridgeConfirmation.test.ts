import { describe, expect, it } from 'vitest';
import { matchBridgeConfirmation, type ExpectedBridgeConfirmation } from './bridgeConfirmation';

const expected: ExpectedBridgeConfirmation = {
	sourceTxId: 'SOURCE',
	sourceNetwork: 101002,
	bridgeAddress: 'ARAMIDFJYV2TOFB5MRNZJIXBSAVZCVAUDAPFGKR5PNX4MTILGAZABBTXQQ',
	destinationAddress: 'DESTINATION',
	destinationAssetId: '123',
	destinationAmount: 1000n
};
const note = (overrides = {}) =>
	btoa(
		'aramid-confirm/v1:j' +
			JSON.stringify({
				sourceTxId: expected.sourceTxId,
				sourceNetwork: expected.sourceNetwork,
				note: 'aramid-fe',
				...overrides
			})
	);
const axfer = () => ({
	sender: expected.bridgeAddress,
	'tx-type': 'axfer',
	note: note(),
	'asset-transfer-transaction': {
		amount: 1000,
		'asset-id': 123,
		receiver: expected.destinationAddress
	}
});
const pay = () => ({
	sender: expected.bridgeAddress,
	'tx-type': 'pay',
	note: note(),
	'payment-transaction': { amount: 1000, receiver: expected.destinationAddress }
});

describe('matchBridgeConfirmation', () => {
	it('matches the real bridge axfer shape', () => {
		expect(matchBridgeConfirmation(axfer(), expected)).toEqual({ status: 'match' });
	});
	it.each([null, 0, '0'])('matches a native pay for asset %s', (destinationAssetId) => {
		expect(matchBridgeConfirmation(pay(), { ...expected, destinationAssetId })).toEqual({
			status: 'match'
		});
	});
	it.each([1000n, 1000, '1000'])('accepts expected atomic amount %s', (destinationAmount) => {
		expect(matchBridgeConfirmation(axfer(), { ...expected, destinationAmount })).toEqual({
			status: 'match'
		});
	});
	it.each([
		['sender', { sender: 'OTHER' }],
		[
			'receiver',
			{ 'asset-transfer-transaction': { amount: 1000, 'asset-id': 123, receiver: 'OTHER' } }
		],
		[
			'asset',
			{
				'asset-transfer-transaction': {
					amount: 1000,
					'asset-id': 124,
					receiver: expected.destinationAddress
				}
			}
		],
		['sourceTxId', { note: note({ sourceTxId: 'OTHER' }) }],
		['sourceNetwork', { note: note({ sourceNetwork: 101001 }) }],
		['prefix', { note: btoa(JSON.stringify({ sourceTxId: 'SOURCE', sourceNetwork: 101002 })) }],
		['base64', { note: 'not!base64' }],
		['JSON', { note: btoa('aramid-confirm/v1:j{') }],
		['missing note', { note: undefined }],
		['non-string note', { note: 123 }],
		['missing transfer', { 'asset-transfer-transaction': undefined }]
	])('rejects wrong or malformed %s', (_, change) => {
		expect(matchBridgeConfirmation({ ...axfer(), ...change }, expected).status).toBe('no-match');
	});
	it('rejects pay when an asset is expected', () => {
		expect(matchBridgeConfirmation(pay(), expected).status).toBe('no-match');
	});
	it('rejects axfer when native is expected', () => {
		expect(matchBridgeConfirmation(axfer(), { ...expected, destinationAssetId: null }).status).toBe(
			'no-match'
		);
	});
	it('rejects the wrong native receiver', () => {
		const tx = pay();
		tx['payment-transaction'].receiver = 'OTHER';
		expect(matchBridgeConfirmation(tx, { ...expected, destinationAssetId: null }).status).toBe(
			'no-match'
		);
	});
	it('reports an amount mismatch only after every other field matches', () => {
		expect(matchBridgeConfirmation(axfer(), { ...expected, destinationAmount: 999 })).toEqual({
			status: 'amount-mismatch',
			expected: 999n,
			actual: 1000n
		});
		expect(
			matchBridgeConfirmation(
				{ ...axfer(), sender: 'OTHER' },
				{ ...expected, destinationAmount: 999 }
			).status
		).toBe('no-match');
	});
	it.each([1.5, NaN, Infinity, -1, '-1', '1.5', '', ' ', null, undefined, true, {}])(
		'rejects invalid amount %s on either side',
		(amount) => {
			const tx = {
				...axfer(),
				'asset-transfer-transaction': { ...axfer()['asset-transfer-transaction'], amount }
			};
			expect(matchBridgeConfirmation(tx, expected)).toEqual({
				status: 'no-match',
				reason: 'amount'
			});
			expect(
				matchBridgeConfirmation(axfer(), { ...expected, destinationAmount: amount as never })
			).toEqual({ status: 'no-match', reason: 'amount' });
		}
	);
	it.each([
		null,
		undefined,
		3,
		'tx',
		[],
		Object.defineProperty({}, 'note', {
			get() {
				throw new Error('hostile');
			}
		})
	])('never throws for hostile tx %#', (tx) => {
		expect(matchBridgeConfirmation(tx, expected).status).toBe('no-match');
	});
	it('decodes UTF-8 and rejects invalid UTF-8', () => {
		const text = 'aramid-confirm/v1:j' + JSON.stringify({ sourceTxId: 'é', sourceNetwork: 101002 });
		const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
		expect(
			matchBridgeConfirmation({ ...axfer(), note: encoded }, { ...expected, sourceTxId: 'é' })
				.status
		).toBe('match');
		expect(matchBridgeConfirmation({ ...axfer(), note: btoa('\xff') }, expected).status).toBe(
			'no-match'
		);
	});
});
