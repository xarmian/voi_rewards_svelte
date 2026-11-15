import { describe, expect, it } from 'vitest';
import {
	normalizeOptions,
	buildQuery,
	formatUnits,
	mapTransaction,
	matchesFilters,
	compareRows,
	type ExportInput,
	type NormalizedTransaction
} from './transactionExport';

const input: ExportInput = {
	pageAddress: 'A',
	addresses: ['A'],
	allDates: false,
	from: '2024-02-29',
	through: '2024-02-29',
	types: ['payment', 'reward-payout', 'close-out', 'fee']
};
const options = (changes: Partial<ExportInput> = {}) =>
	normalizeOptions({ ...input, ...changes }, '2024-12-31', (a) => /^[A-Z]+$/.test(a));
const root: NormalizedTransaction = {
	id: 'ROOT',
	round: 9007199254740993n,
	timestamp: 1709164800,
	group: 'AQI=',
	type: 'pay',
	sender: 'A',
	fee: 9007199254740993n,
	note: '',
	inner: [],
	payment: { receiver: 'B', amount: 9007199254740993n, closeAmount: 10n, closeTo: 'C' }
};
const map = (tx = root, accounts = ['A', 'B', 'C'], rewards = ['A']) =>
	mapTransaction(tx, new Set(accounts), new Set(rewards));

describe('native transaction effects', () => {
	it('keeps independent incoming/outgoing effects, close remainder and one exact payer fee', () => {
		const rows = map();
		expect(rows.map((r) => [r.account, r.type, r.direction, r.amount, r.fee])).toEqual([
			['A', 'payment', 'out', 9007199254740993n, 0n],
			['B', 'reward-payout', 'in', 9007199254740993n, 0n],
			['A', 'close-out', 'out', 10n, 0n],
			['C', 'close-out', 'in', 10n, 0n],
			['A', 'fee', 'fee', 0n, 9007199254740993n]
		]);
		expect(rows.every((r) => r.group === 'AQI=' && r.round === root.round)).toBe(true);
		expect(map(root, ['B'], [])[0].type).toBe('payment');
		expect(map(root, ['B']).some((r) => r.type === 'fee')).toBe(false);
	});
	it('retains self and zero payments without classifying self as a reward', () => {
		const rows = map({ ...root, fee: 0n, payment: { receiver: 'A', amount: 0n, closeAmount: 0n } });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ direction: 'self', type: 'payment', amount: 0n });
	});
	it('recurses through applications and token nodes, retaining actual inner fees and nearest app', () => {
		const tx: NormalizedTransaction = {
			...root,
			type: 'appl',
			payment: undefined,
			applicationId: 1n,
			fee: 3000n,
			inner: [
				{
					...root,
					type: 'appl',
					applicationId: 2n,
					payment: undefined,
					fee: 0n,
					note: 'parent',
					inner: [
						{
							...root,
							type: 'axfer',
							payment: undefined,
							fee: 0n,
							inner: [
								{
									...root,
									fee: 7n,
									note: 'child',
									payment: { receiver: 'B', amount: 5n, closeAmount: 0n }
								}
							]
						}
					]
				}
			]
		};
		const rows = map(tx);
		expect(rows.map((r) => [r.innerPath, r.type, r.fee])).toEqual([
			['', 'fee', 3000n],
			['0.0.0', 'payment', 0n],
			['0.0.0', 'reward-payout', 0n],
			['0.0.0', 'fee', 7n]
		]);
		expect(rows[1]).toMatchObject({ applicationId: 2n, note: 'child', txId: 'ROOT' });
	});
	it.each(['axfer', 'keyreg', 'acfg', 'appl'])(
		'exports only actual native fees for %s without native payments',
		(type) => {
			expect(map({ ...root, type, payment: undefined })).toHaveLength(1);
		}
	);
	it('orders unknown offsets after known offsets and numeric paths before effect/account ties', () => {
		const row = map()[0];
		const rows = [
			{ ...row, innerPath: '0.10', offset: 1 },
			{ ...row, innerPath: '', offset: undefined },
			{ ...row, innerPath: '0.2', offset: 1 },
			{ ...row, innerPath: '', offset: 1 }
		];
		expect(rows.sort(compareRows).map((r) => [r.offset, r.innerPath])).toEqual([
			[1, ''],
			[1, '0.2'],
			[1, '0.10'],
			[undefined, '']
		]);
	});
});

describe('exact units and export options', () => {
	it.each([
		[9007199254740993n, 6, '9007199254.740993'],
		[0n, 6, '0'],
		[10n, 0, '10'],
		[-1234000n, 6, '-1.234'],
		[1n, 255, '0.' + '0'.repeat(254) + '1']
	] as const)('formats %s with %s decimals', (n, decimals, expected) =>
		expect(formatUnits(n, decimals)).toBe(expected)
	);
	it('rejects invalid decimal scales', () => {
		expect(() => formatUnits(1n, -1)).toThrow();
		expect(() => formatUnits(1n, 256)).toThrow();
	});
	it('validates leap days, deduplicates addresses and puts the page account first', () => {
		expect(options({ addresses: [' C ', 'B', 'A', 'B'] }).addresses).toEqual(['A', 'B', 'C']);
		expect(options().startTime).toBe(1709164800);
	});
	it.each([
		{ from: '2023-02-29' },
		{ through: '2024-02-30' },
		{ from: '2024-03-01' },
		{ through: '2025-01-01' },
		{ from: '' },
		{ addresses: [] },
		{ addresses: ['bad!'] },
		{ addresses: 'ABCDEFGHIJK'.split('') },
		{ types: [] }
	])('rejects invalid options %j', (changes) => expect(() => options(changes)).toThrow());
	it('builds padded server bounds and exact half-open UTC membership without type restrictions', () => {
		const opts = options();
		expect(buildQuery(opts, 'A', 99n, 'cursor')).toEqual({
			address: 'A',
			maxRound: 99n,
			limit: 500,
			nextToken: 'cursor',
			afterTime: '2024-02-28T23:59:59.000Z',
			beforeTime: '2024-03-01T00:00:00.000Z'
		});
		const row = map()[0];
		expect(
			[-1, 0, 86399, 86400].map((delta) =>
				matchesFilters({ ...row, timestamp: 1709164800 + delta }, opts)
			)
		).toEqual([false, true, true, false]);
		expect(matchesFilters(row, options({ types: ['fee'] }))).toBe(false);
		expect(buildQuery(options({ allDates: true, from: '', through: '' }), 'A', 99n)).toEqual({
			address: 'A',
			maxRound: 99n,
			limit: 500
		});
	});
});
