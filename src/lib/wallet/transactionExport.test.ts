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
import { BLOCK_REWARD_NOTE_PREFIX, FEE_SINK_ADDRESS } from '$lib/rewards/blockRewardConstants';

const input: ExportInput = {
	assets: { mode: 'native' },
	pageAddress: 'A',
	addresses: ['A'],
	allDates: false,
	from: '2024-02-29',
	through: '2024-02-29',
	types: ['payment', 'reward-payout', 'block-reward', 'asset-transfer', 'close-out', 'fee']
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

describe('block reward classification', () => {
	const payout = (changes: Partial<NormalizedTransaction> = {}): NormalizedTransaction => ({
		...root,
		round: 23944300n,
		sender: FEE_SINK_ADDRESS,
		fee: 0n,
		note: BLOCK_REWARD_NOTE_PREFIX + '23944300',
		payment: { receiver: 'B', amount: 5n, closeAmount: 0n },
		...changes
	});
	const types = (tx: NormalizedTransaction, rewards = ['R']) =>
		map(tx, ['B', FEE_SINK_ADDRESS], rewards).map((r) => [r.account, r.type]);
	it('classifies an incoming fee sink payment noted for the same round as a block reward', () => {
		expect(types(payout())).toEqual([
			[FEE_SINK_ADDRESS, 'payment'],
			['B', 'block-reward']
		]);
		expect(
			map(
				payout({ round: 9007199254740993n, note: BLOCK_REWARD_NOTE_PREFIX + '9007199254740993' }),
				['B']
			)[0].type
		).toBe('block-reward');
	});
	it('keeps fee sink payments noted for a different round as payments', () => {
		expect(types(payout({ note: BLOCK_REWARD_NOTE_PREFIX + '23944299' }))).toContainEqual([
			'B',
			'payment'
		]);
		expect(types(payout({ note: BLOCK_REWARD_NOTE_PREFIX + '23944300 ' }))).toContainEqual([
			'B',
			'payment'
		]);
	});
	it('keeps fee sink payments without the payout note as payments', () => {
		expect(types(payout({ note: '' }))).toContainEqual(['B', 'payment']);
		expect(types(payout({ note: 'base64:AAEC' }))).toContainEqual(['B', 'payment']);
	});
	it('still classifies known reward senders as reward payouts', () => {
		expect(types(payout({ sender: 'R', note: '' }))).toEqual([['B', 'reward-payout']]);
		expect(types(payout({ sender: 'R' }))).toEqual([['B', 'reward-payout']]);
	});
	it('never classifies an outgoing payment to the fee sink as a block reward', () => {
		const rows = map(
			payout({ sender: 'B', payment: { receiver: FEE_SINK_ADDRESS, amount: 5n, closeAmount: 0n } }),
			['B']
		);
		expect(rows.map((r) => [r.direction, r.type])).toEqual([['out', 'payment']]);
	});
	it('never classifies a fee sink close-out or asset transfer as a block reward', () => {
		const close = map(
			payout({ payment: { receiver: 'C', amount: 0n, closeAmount: 5n, closeTo: 'B' } }),
			['B']
		);
		expect(close.map((r) => r.type)).toEqual(['close-out']);
		const asset = map(
			payout({
				type: 'axfer',
				payment: undefined,
				assetTransfer: { assetId: 1n, receiver: 'B', amount: 5n, closeAmount: 0n }
			}),
			['B']
		);
		expect(asset.map((r) => r.type)).toEqual(['asset-transfer']);
	});
	it('respects the block reward type filter', () => {
		const ordinary = payout({
			sender: 'B',
			note: '',
			payment: { receiver: 'C', amount: 1n, closeAmount: 0n }
		});
		const rows = [...map(payout(), ['B']), ...map(ordinary, ['B'], [])];
		const all = { allDates: true, from: '', through: '' };
		expect(rows.map((r) => r.type)).toEqual(['block-reward', 'payment']);
		expect(
			rows
				.filter((r) =>
					matchesFilters(r, options({ ...all, types: ['payment', 'reward-payout', 'fee'] }))
				)
				.map((r) => r.type)
		).toEqual(['payment']);
		expect(
			rows
				.filter((r) => matchesFilters(r, options({ ...all, types: ['block-reward'] })))
				.map((r) => r.type)
		).toEqual(['block-reward']);
	});
	it('accepts block-reward as a selectable activity type', () => {
		expect(options({ types: ['block-reward'] }).types).toEqual(['block-reward']);
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

const assetRoot = (changes: Partial<NormalizedTransaction> = {}): NormalizedTransaction => ({
	...root,
	type: 'axfer',
	payment: undefined,
	fee: 1000n,
	assetTransfer: { assetId: 9007199254740995n, receiver: 'B', amount: 5n, closeAmount: 0n },
	...changes
});
describe('asset effects', () => {
	it('maps both selected participants, keeps native fees separate and never classifies assets as rewards', () => {
		expect(
			map(assetRoot()).map((r) => [r.account, r.type, r.direction, r.assetId, r.amount, r.fee])
		).toEqual([
			['A', 'asset-transfer', 'out', 9007199254740995n, 5n, 0n],
			['B', 'asset-transfer', 'in', 9007199254740995n, 5n, 0n],
			['A', 'fee', 'fee', null, 0n, 1000n]
		]);
	});
	it('retains exactly one zero self effect', () => {
		const tx = assetRoot({
			fee: 0n,
			assetTransfer: { assetId: 1n, receiver: 'A', amount: 0n, closeAmount: 0n }
		});
		expect(map(tx)).toEqual([
			expect.objectContaining({
				account: 'A',
				direction: 'self',
				type: 'asset-transfer',
				amount: 0n
			})
		]);
	});
	it('debits the clawback target while charging only the authority and includes the authority when it is a recipient', () => {
		const tx = assetRoot({
			sender: 'K',
			assetTransfer: { assetId: 1n, sender: 'A', receiver: 'B', amount: 5n, closeAmount: 0n }
		});
		expect(
			map(tx, ['A', 'B', 'K']).map((r) => [r.account, r.from, r.to, r.type, r.direction])
		).toEqual([
			['A', 'A', 'B', 'asset-transfer', 'out'],
			['B', 'A', 'B', 'asset-transfer', 'in'],
			['K', 'K', '', 'fee', 'fee']
		]);
		expect(
			map({ ...tx, assetTransfer: { ...tx.assetTransfer!, receiver: 'K' } }, ['K']).map(
				(r) => r.type
			)
		).toEqual(['asset-transfer', 'fee']);
	});
	it.each([
		[5n, 7n, 'C'],
		[0n, 0n, 'C'],
		[5n, 7n, 'B']
	] as const)('keeps amount %s and close %s to %s independent', (amount, closeAmount, closeTo) => {
		const rows = map(
			assetRoot({ assetTransfer: { assetId: 1n, receiver: 'B', amount, closeAmount, closeTo } })
		);
		expect(rows.map((r) => [r.account, r.effect, r.to, r.amount])).toEqual([
			['A', 'amount', 'B', amount],
			['B', 'amount', 'B', amount],
			['A', 'close', closeTo, closeAmount],
			[closeTo, 'close', closeTo, closeAmount],
			['A', 'fee', '', 0n]
		]);
		expect(rows.filter((r) => r.effect === 'close').every((r) => r.type === 'close-out')).toBe(
			true
		);
	});
	it('rejects positive close without a recipient', () => {
		expect(() =>
			map(assetRoot({ assetTransfer: { assetId: 1n, receiver: 'B', amount: 0n, closeAmount: 1n } }))
		).toThrow(/recipient/);
	});
	it('visits nested assets and native siblings under unrelated parents with root identity and nearest application', () => {
		const tx = {
			...root,
			type: 'appl',
			sender: 'X',
			fee: 0n,
			applicationId: 10n,
			inner: [
				{
					...root,
					type: 'appl',
					sender: 'X',
					fee: 0n,
					applicationId: 20n,
					inner: [assetRoot({ note: 'asset note', inner: [assetRoot({ fee: 7n })] })]
				},
				{ ...root, fee: 0n, payment: { receiver: 'B', amount: 2n, closeAmount: 0n } }
			]
		};
		const rows = map(tx, ['A']).sort(compareRows);
		expect(rows.map((r) => [r.innerPath, r.type, r.applicationId, r.fee])).toEqual([
			['0.0', 'asset-transfer', 20n, 0n],
			['0.0', 'fee', 20n, 1000n],
			['0.0.0', 'asset-transfer', 20n, 0n],
			['0.0.0', 'fee', 20n, 7n],
			['1', 'payment', 10n, 0n]
		]);
		expect(rows[0]).toMatchObject({
			txId: 'ROOT',
			timestamp: root.timestamp,
			round: root.round,
			group: root.group,
			note: 'asset note'
		});
	});
});
describe('asset options and combined filters', () => {
	it.each(['native', 'all'] as const)('retains and freezes %s scope', (mode) => {
		const result = options({ assets: { mode } });
		expect(result.assets).toEqual({ mode });
		expect(Object.isFrozen(result.assets)).toBe(true);
	});
	it.each([' 0009007199254740995 ', '18446744073709551615'])(
		'canonicalizes exact asset ID %s',
		(id) => {
			expect(options({ assets: { mode: 'asset', id } }).assets).toEqual({
				mode: 'asset',
				id: BigInt(id.trim())
			});
		}
	);
	it.each(['', '0', '-1', '1.1', '1e3', '18446744073709551616', '+1', '1 2'])(
		'rejects asset ID %j',
		(id) => {
			expect(() => options({ assets: { mode: 'asset', id } })).toThrow(
				'Enter an asset ID from 1 to 18446744073709551615.'
			);
		}
	);
	it('combines date, type and asset matching while retaining all selected-account fees for one asset', () => {
		const rows = [
			...map(assetRoot()),
			...map(root),
			...map(
				assetRoot({ assetTransfer: { assetId: 2n, receiver: 'B', amount: 8n, closeAmount: 0n } })
			)
		];
		const native = options();
		const all = options({ assets: { mode: 'all' } });
		const specific = options({ assets: { mode: 'asset', id: '9007199254740995' } });
		expect(rows.filter((r) => matchesFilters(r, native))).toHaveLength(7);
		expect(rows.filter((r) => matchesFilters(r, all))).toHaveLength(11);
		expect(rows.filter((r) => matchesFilters(r, specific)).map((r) => r.type)).toEqual([
			'asset-transfer',
			'asset-transfer',
			'fee',
			'fee',
			'fee'
		]);
		expect(
			rows.filter((r) => matchesFilters(r, { ...specific, types: ['asset-transfer'] }))
		).toHaveLength(2);
		expect(matchesFilters({ ...rows[0], timestamp: root.timestamp + 86400 }, specific)).toBe(false);
	});
});

describe('ARC-200 namespaces and ordering', () => {
	it('includes ARC only in all assets and preserves exact type/date boundaries', () => {
		const asa = { ...map(assetRoot())[0], assetId: 1n, assetKind: 'asa' as const };
		const arc = { ...asa, assetKind: 'arc200' as const, arc200Occurrence: 0 };
		expect(matchesFilters(arc, options({ assets: { mode: 'asset', id: '1' } }))).toBe(false);
		expect(matchesFilters(asa, options({ assets: { mode: 'asset', id: '1' } }))).toBe(true);
		expect(matchesFilters(arc, options())).toBe(false);
		expect(matchesFilters(arc, options({ assets: { mode: 'all' } }))).toBe(true);
		expect(matchesFilters(arc, options({ assets: { mode: 'all' }, types: ['fee'] }))).toBe(false);
		expect(
			[-1, 0, 86399, 86400].map((delta) =>
				matchesFilters(
					{ ...arc, timestamp: root.timestamp + delta },
					options({ assets: { mode: 'all' } })
				)
			)
		).toEqual([false, true, true, false]);
	});
	it('orders sources before offsets and keeps mixed triples transitive', () => {
		const native = map()[0];
		const rows = [
			{ ...native, assetKind: 'arc200' as const, account: 'B', arc200Occurrence: 3, txId: 'A' },
			{ ...native, assetKind: 'arc200' as const, account: 'A', arc200Occurrence: 1, txId: 'Z' },
			{ ...native, assetKind: 'arc200' as const, account: 'A', arc200Occurrence: 2, txId: 'ZZ' },
			{ ...native, offset: undefined, txId: 'Z' },
			{ ...native, offset: 1, txId: 'A' }
		];
		const sorted = [...rows].sort(compareRows);
		expect(sorted).toEqual([rows[4], rows[3], rows[2], rows[1], rows[0]]);
		for (let a = 0; a < sorted.length; a++)
			for (let b = a + 1; b < sorted.length; b++)
				expect(compareRows(sorted[a], sorted[b])).toBeLessThan(0);
	});
});
