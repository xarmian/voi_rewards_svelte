import { ALGORAND_ZERO_ADDRESS_STRING as ZERO, encodeAddress, isValidAddress } from 'algosdk';
import { describe, expect, it } from 'vitest';
import {
	normalizeArc200Page,
	normalizeArc200Metadata,
	selectArc200Window,
	mapArc200Transfer
} from './arc200Export';
import { formatUnits } from './transactionExport';

const [A, B] = [1, 2].map((n) => encodeAddress(new Uint8Array(32).fill(n)));
const query = { address: A, minRound: 1n, maxRound: 200000n };
const record = (changes: Record<string, unknown> = {}) => ({
	contractid: '1',
	from: A,
	to: B,
	amount: '9007199254740993',
	round: 100,
	timestamp: 1704067200,
	transactionid: null,
	note: null,
	...changes
});
const page = (records: unknown[]) => normalizeArc200Page(records, query, isValidAddress);

describe('exact ARC-200 records', () => {
	it.each(['0', '9007199254740993', ((1n << 256n) - 1n).toString()])(
		'retains exact amount %s',
		(amount) => {
			expect(page([record({ amount })])[0].amount).toBe(BigInt(amount));
		}
	);
	it.each([1, Number.MAX_SAFE_INTEGER + 1, '1.5', '-1', '1e3', '', (1n << 256n).toString()])(
		'rejects invalid amount %s',
		(amount) => expect(() => page([record({ amount })])).toThrow()
	);
	it.each([
		{ round: 0 },
		{ round: Number.MAX_SAFE_INTEGER + 1 },
		{ round: 200001 },
		{ timestamp: -1 },
		{ timestamp: 8640000000001 },
		{ contractid: '9007199254740992' },
		{ contractid: 1 },
		{ from: 'bad' },
		{ from: B, to: B },
		{ transactionid: 1 },
		{ note: {} }
	])('rejects invalid transfer %j', (changes) => expect(() => page([record(changes)])).toThrow());
	it('rejects ascending, oversize, out-of-window and malformed pages', () => {
		expect(() => page([record(), record({ round: 101 })])).toThrow();
		expect(() => page(Array(101).fill(record()))).toThrow();
		expect(() =>
			normalizeArc200Page([record()], { ...query, minRound: 101n }, isValidAddress)
		).toThrow();
		expect(() => page({} as unknown as unknown[])).toThrow();
	});
	it('keeps duplicate occurrences and maps only the queried account, including self, mint and burn', () => {
		const transfers = page([record(), record()]);
		const rows = transfers.map((t, i) => mapArc200Transfer(t, A, i));
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.arc200Occurrence)).toEqual([0, 1]);
		expect(rows[0]).toMatchObject({
			assetKind: 'arc200',
			account: A,
			assetId: 1n,
			applicationId: 1n,
			direction: 'out',
			txId: '',
			innerPath: '',
			group: '',
			fee: 0n,
			transactionType: 'appl',
			type: 'asset-transfer'
		});
		expect(mapArc200Transfer(transfers[0], B, 0).direction).toBe('in');
		expect(mapArc200Transfer(page([record({ to: A })])[0], A, 0).direction).toBe('self');
		expect(mapArc200Transfer(page([record({ from: ZERO, to: A })])[0], A, 0)).toMatchObject({
			from: ZERO,
			direction: 'in'
		});
		expect(mapArc200Transfer(page([record({ to: ZERO })])[0], A, 0)).toMatchObject({
			to: ZERO,
			direction: 'out'
		});
	});
});
describe('ARC-200 metadata', () => {
	it.each([0, 18, 255])('uses explicit scale %s exactly', (decimals) => {
		const result = normalizeArc200Metadata({ tokens: [{ contractId: 1, decimals }] }, 1n);
		expect(result).toEqual({ id: 1n, decimals, name: '', unitName: '' });
		expect(Object.isFrozen(result)).toBe(true);
		if (decimals === 0)
			expect(formatUnits(9007199254740993n, result.decimals!)).toBe('9007199254740993');
		if (decimals === 18)
			expect(formatUnits(9007199254740993n, result.decimals!)).toBe('0.009007199254740993');
	});
	it.each([undefined, null, -1, 256, 1.5, '6'])(
		'keeps unavailable decimals %s unknown',
		(decimals) =>
			expect(
				normalizeArc200Metadata({ tokens: [{ contractId: '1', decimals }] }, 1n).decimals
			).toBeNull()
	);
	it('caches an empty metadata result without inventing a scale or label', () =>
		expect(normalizeArc200Metadata({ tokens: [] }, 1n)).toEqual({
			id: 1n,
			decimals: null,
			unitName: '',
			name: ''
		}));
	it.each([
		{},
		{ tokens: null },
		{ tokens: [{ contractId: 2 }] },
		{ tokens: [{ contractId: 1 }, { contractId: 1 }] },
		{ tokens: [{ contractId: 9007199254740992 }] },
		{ tokens: [{ contractId: 1, symbol: 5 }] }
	])('rejects malformed metadata %j', (value) =>
		expect(() => normalizeArc200Metadata(value, 1n)).toThrow()
	);
});
describe('whole-round cursor', () => {
	it('withholds an oldest-round suffix and retains it exactly once on the inclusive re-query', () => {
		const first = page([...Array(98).fill(record({ round: 101 })), ...Array(2).fill(record())]);
		expect(selectArc200Window(first, 101n)).toEqual({
			kind: 'next',
			accepted: first.slice(0, 98),
			upperRound: 100n
		});
		const last = page(Array(3).fill(record()));
		expect(selectArc200Window(last, 100n)).toEqual({ kind: 'done', accepted: last });
		expect(selectArc200Window([], 100n)).toEqual({ kind: 'done', accepted: [] });
	});
	it('caps an exactly full single round without retaining any of it', () =>
		expect(selectArc200Window(page(Array(100).fill(record())), 100n)).toEqual({
			kind: 'cap',
			accepted: [],
			round: 100n
		}));
	it('walks more than 100100 sparse records without offsets or overlapping accepted rounds', () => {
		let upper = 101000n,
			count = 0;
		while (upper > 0n) {
			const records = page(
				Array.from({ length: Number(upper > 100n ? 100n : upper) }, (_, i) =>
					record({ round: Number(upper) - i })
				)
			);
			const result = selectArc200Window(records, upper);
			count += result.accepted.length;
			if (result.kind === 'done') break;
			expect(result.kind).toBe('next');
			if (result.kind !== 'next') break;
			expect(result.upperRound).toBeLessThan(upper);
			upper = result.upperRound;
		}
		expect(count).toBe(101000);
	});
});
