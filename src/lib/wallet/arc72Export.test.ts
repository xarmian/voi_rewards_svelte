import { ALGORAND_ZERO_ADDRESS_STRING as ZERO, encodeAddress, isValidAddress } from 'algosdk';
import { describe, expect, it } from 'vitest';
import {
	ARC72_MAX_ROUND_WINDOW,
	ARC72_PAGE_LIMIT,
	ARC72_SOURCE_NOTE,
	ARC72_CAP_WARNING,
	arc72CurrentRound,
	assertArc72Bound,
	assertArc72Query,
	mapArc72Transfer,
	normalizeArc72Page,
	selectArc72Window
} from './arc72Export';

const [A, B, C] = [1, 2, 3].map((n) => encodeAddress(new Uint8Array(32).fill(n)));
const query = { address: A, minRound: 1n, maxRound: 200000n };
const transfer = (changes: Record<string, unknown> = {}) => ({
	contractId: '5',
	tokenId: '7',
	fromAddr: A,
	toAddr: B,
	round: 100,
	timestamp: 1704067200,
	transactionId: 'TX',
	note: null,
	...changes
});
const envelope = (transfers: unknown[], changes: Record<string, unknown> = {}) => ({
	transfers,
	'next-token': null,
	'total-count': transfers.length,
	'current-round': 300000,
	...changes
});
const page = (transfers: unknown[], changes: Record<string, unknown> = {}) =>
	normalizeArc72Page(envelope(transfers, changes), query, isValidAddress);

describe('ARC-72 constants', () => {
	it('fixes the window, page size and disclosure copy', () => {
		expect(ARC72_MAX_ROUND_WINDOW).toBe(1_000_000);
		expect(ARC72_PAGE_LIMIT).toBe(1000);
		expect(ARC72_SOURCE_NOTE).toContain('only the first move is recorded');
		expect(ARC72_CAP_WARNING).toContain('1,000 transfers');
	});
	it('refuses unsafe or oversize query windows', () => {
		for (const bad of [
			{ ...query, minRound: 0n },
			{ ...query, maxRound: 9007199254740992n },
			{ ...query, minRound: 3n, maxRound: 2n },
			{ ...query, maxRound: 1000002n }
		])
			expect(() => assertArc72Query(bad)).toThrow();
		expect(() => assertArc72Query({ ...query, maxRound: 1000001n })).not.toThrow();
	});
	it('bounds NFT IDs and rounds like ARC-200 but names NFT in its message', () => {
		const message = 'ARC-72 NFT contract IDs and round bounds must be positive safe integers.';
		expect(() => assertArc72Bound(1n)).not.toThrow();
		expect(() => assertArc72Bound(BigInt(Number.MAX_SAFE_INTEGER))).not.toThrow();
		for (const bad of [0n, -1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n])
			expect(() => assertArc72Bound(bad)).toThrow(message);
		expect(() => assertArc72Query({ ...query, minRound: 0n })).toThrow(message);
		expect(() => page([transfer({ contractId: '0' })])).toThrow(message);
	});
});

describe('ARC-72 page normalizer', () => {
	it('accepts the measured shape and keeps exact values', () => {
		const result = page([transfer(), transfer({ transactionId: null, note: 'hi', round: 1 })]);
		expect(result.totalCount).toBe(2);
		expect(result.currentRound).toBe(300000n);
		expect(result.nextToken).toBeNull();
		expect(result.transfers[0]).toEqual({
			contractId: 5n,
			tokenId: 7n,
			from: A,
			to: B,
			round: 100n,
			timestamp: 1704067200,
			txId: 'TX',
			note: ''
		});
		expect(result.transfers[1]).toMatchObject({ txId: '', note: 'hi', round: 1n });
	});
	it('keeps a uint256-max token ID and token ID zero exactly', () => {
		const max = (1n << 256n) - 1n;
		expect(page([transfer({ tokenId: max.toString() })]).transfers[0].tokenId).toBe(max);
		expect(page([transfer({ tokenId: '0' })]).transfers[0].tokenId).toBe(0n);
	});
	it('accepts rows in any round order inside the window', () => {
		const rows = page([transfer({ round: 1 }), transfer({ round: 200000 }), transfer()]);
		expect(rows.transfers.map((t) => t.round)).toEqual([1n, 200000n, 100n]);
	});
	it('accepts mints and burns through the zero address', () => {
		expect(page([transfer({ fromAddr: ZERO, toAddr: A })]).transfers[0].from).toBe(ZERO);
		expect(page([transfer({ toAddr: ZERO })]).transfers[0].to).toBe(ZERO);
	});
	it.each([
		{ tokenId: (1n << 256n).toString() },
		{ tokenId: '1.5' },
		{ tokenId: '-1' },
		{ tokenId: '' },
		{ tokenId: 7 },
		{ contractId: '0' },
		{ contractId: '9007199254740992' },
		{ contractId: 5 },
		{ fromAddr: undefined, from: A },
		{ toAddr: undefined, to: B },
		{ fromAddr: 'bad' },
		{ fromAddr: B, toAddr: C },
		{ round: 0 },
		{ round: 200001 },
		{ round: '100' },
		{ round: Number.MAX_SAFE_INTEGER + 1 },
		{ timestamp: -1 },
		{ timestamp: 1.5 },
		{ timestamp: 8640000000001 },
		{ transactionId: 1 },
		{ note: {} }
	])('refuses the invalid transfer %j', (changes) =>
		expect(() => page([transfer(changes)])).toThrow()
	);
	it.each([
		null,
		[],
		'x',
		{ 'total-count': 0, 'current-round': 1, 'next-token': null },
		envelope([], { transfers: {} }),
		envelope([], { 'total-count': 1.5 }),
		envelope([], { 'total-count': -1 }),
		envelope([], { 'total-count': '0' }),
		envelope([], { 'current-round': 0 }),
		envelope([], { 'current-round': '300000' }),
		envelope([], { 'next-token': 0 }),
		envelope(Array(1001).fill(transfer()))
	])('refuses the malformed envelope %#', (value) =>
		expect(() => normalizeArc72Page(value, query, isValidAddress)).toThrow()
	);
	it('refuses an unsafe query before reading the page', () =>
		expect(() =>
			normalizeArc72Page(envelope([]), { ...query, maxRound: 1000002n }, isValidAddress)
		).toThrow());
	it('reads the current round lightly for the lag check', () => {
		expect(arc72CurrentRound(envelope([]))).toBe(300000n);
		for (const value of [null, [], {}, envelope([], { 'current-round': 0 })])
			expect(arc72CurrentRound(value)).toBeUndefined();
	});
});

describe('ARC-72 window contract', () => {
	it('splits an oversize multi-round window without keeping any rows', () =>
		expect(
			selectArc72Window(page(Array(1000).fill(transfer()), { 'total-count': 1001 }), query)
		).toEqual({ kind: 'split' }));
	it('caps an oversize single round and names it', () => {
		const one = { address: A, minRound: 100n, maxRound: 100n };
		const dense = normalizeArc72Page(
			envelope(Array(1000).fill(transfer()), { 'total-count': 1001 }),
			one,
			isValidAddress
		);
		expect(selectArc72Window(dense, one)).toEqual({ kind: 'cap', round: 100n });
	});
	it('accepts a page that matches its own count, including a full and an empty page', () => {
		for (const rows of [[transfer(), transfer()], Array(1000).fill(transfer()), []]) {
			const result = page(rows);
			expect(selectArc72Window(result, query)).toEqual({
				kind: 'done',
				accepted: result.transfers
			});
		}
	});
	it('keeps two identical rows of one window', () =>
		expect(selectArc72Window(page([transfer(), transfer()]), query)).toMatchObject({
			kind: 'done',
			accepted: { length: 2 }
		}));
	it.each([
		[[transfer(), transfer()], { 'total-count': 3 }],
		[[transfer(), transfer()], { 'total-count': 1 }],
		[[transfer()], { 'next-token': '1000' }],
		[[transfer()], { 'next-token': '' }]
	])('throws when a page disagrees with its own count %#', (rows, changes) =>
		expect(() => selectArc72Window(page(rows, changes), query)).toThrow(
			'NFT page disagrees with its own total count.'
		)
	);
});

describe('ARC-72 row mapping', () => {
	const one = (changes: Record<string, unknown>, account = A) =>
		mapArc72Transfer(page([transfer(changes)]).transfers[0], account);
	it('maps an outgoing transfer onto the export row', () =>
		expect(one({})).toEqual({
			assetKind: 'arc72',
			assetId: 5n,
			applicationId: 5n,
			nftTokenId: 7n,
			nftEvent: 'transfer',
			timestamp: 1704067200,
			account: A,
			txId: 'TX',
			innerPath: '',
			group: '',
			transactionType: 'appl',
			type: 'nft-transfer',
			effect: 'amount',
			direction: 'out',
			from: A,
			to: B,
			amount: 1n,
			fee: 0n,
			round: 100n,
			note: ''
		}));
	it('maps in, self, mint and burn', () => {
		expect(one({ fromAddr: B, toAddr: A })).toMatchObject({
			direction: 'in',
			nftEvent: 'transfer'
		});
		expect(mapArc72Transfer(page([transfer()]).transfers[0], B)).toMatchObject({
			account: B,
			direction: 'in'
		});
		expect(one({ toAddr: A })).toMatchObject({ direction: 'self', nftEvent: 'transfer' });
		expect(one({ fromAddr: ZERO, toAddr: A })).toMatchObject({
			direction: 'in',
			nftEvent: 'mint',
			from: ZERO
		});
		expect(one({ toAddr: ZERO })).toMatchObject({ direction: 'out', nftEvent: 'burn', to: ZERO });
	});
});
