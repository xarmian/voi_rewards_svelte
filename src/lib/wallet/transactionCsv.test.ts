import { expect, it } from 'vitest';
import { csvCell, protectText, serializeCsv, exportFilename } from './transactionCsv';
import { mapTransaction, normalizeOptions, type ExportRow } from './transactionExport';

const header =
	'"Timestamp (UTC)","Account","Tx ID","Inner path","Transaction type","Type","Direction","From","To","Asset","Amount","Fee (VOI)","Round","Group ID","Application ID","Note","Snapshot round","Export status","Asset ID","Asset unit","Asset name","Asset decimals","Staking contract"\r\n';
const row: ExportRow = {
	assetKind: 'native',
	assetId: null,
	timestamp: 0,
	account: 'B',
	txId: 'ROOT',
	innerPath: '',
	transactionType: 'pay',
	type: 'payment',
	effect: 'amount',
	direction: 'in',
	from: 'A',
	to: 'B',
	amount: 9007199254740993n,
	fee: 0n,
	round: 9007199254740993n,
	group: '',
	note: 'Hi,"世界"\r\nnext'
};
const context = {
	arc200Assets: new Map(),
	assets: new Map(),
	stakingContracts: new Map<string, string>(),
	snapshotRound: 9007199254740999n,
	status: 'complete-indexed' as const
};

it('writes exact RFC 4180 bytes with one header, quoted cells and final CRLF', () => {
	expect(serializeCsv([row], context)).toBe(
		header +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","pay","payment","in","A","B","VOI","9007199254.740993","0","9007199254740993","","","Hi,""世界""\r\nnext","9007199254740999","complete-indexed","","VOI","VOI (native)","6",""\r\n'
	);
	expect(serializeCsv([], context)).toBe(header);
	expect(csvCell('a,"b"')).toBe('"a,""b"""');
});
it.each(['=1+1', ' +cmd', '\u0001-1', ' \tinnocent', '\rabc', '\nabc', '  @SUM(1)'])(
	'protects spreadsheet text %j',
	(value) => expect(protectText(value)).toBe("'" + value)
);
it.each(['Hello', '世界', '  hello', 'base64:/w=='])('preserves innocent text %j', (value) =>
	expect(protectText(value)).toBe(value)
);
it('stamps partial status on every row and protects notes while leaving generated numbers exact', () => {
	const csv = serializeCsv(
		[
			{ ...row, note: '=1' },
			{ ...row, note: 'base64:/w==' }
		],
		{ ...context, status: 'partial-error' }
	);
	expect(csv.match(/"partial-error"/g)).toHaveLength(2);
	expect(csv).toContain('"\'=1"');
	expect(csv).toContain('"base64:/w=="');
	expect(csv).toContain('"9007199254740993"');
});
it('marks native-only scope, page identity, range, accounts, round and every partial filename', () => {
	const options = normalizeOptions(
		{
			assets: { mode: 'native' },
			pageAddress: 'ABCDEFGHXYZ',
			addresses: ['B'],
			from: '2024-01-01',
			through: '2024-12-31',
			types: ['payment']
		},
		'2024-12-31',
		() => true
	);
	const filenameContext = { ...context, pageAddress: options.pageAddress };
	expect(exportFilename(options, filenameContext)).toBe(
		'voi-native-only-activity-ABCDEFGH-2024-01-01_to_2024-12-31-1accounts-r9007199254740999.csv'
	);
	for (const status of [
		'partial-cap',
		'partial-error',
		'partial-cancelled',
		'partial-source'
	] as const) {
		expect(exportFilename({ ...options, allDates: true }, { ...filenameContext, status })).toBe(
			'voi-native-only-activity-ABCDEFGH-all-dates-1accounts-r9007199254740999-partial.csv'
		);
	}
	expect(exportFilename(options, filenameContext)).toMatch(/^voi-native-only-activity-/);
});

it('uses all three exact scope prefixes without asset text in filenames', () => {
	const base = {
		pageAddress: 'ABCDEFGHXYZ',
		addresses: ['A'],
		allDates: true,
		types: ['fee'] as const
	};
	for (const [assets, prefix] of [
		[{ mode: 'native' }, 'voi-native-only-activity-'],
		[{ mode: 'all' }, 'voi-all-assets-activity-'],
		[{ mode: 'asset', id: '9007199254740995' }, 'voi-asset-9007199254740995-activity-']
	] as const) {
		const options = normalizeOptions({ ...base, assets }, '2024-12-31', () => true);
		expect(exportFilename(options, { ...context, pageAddress: base.pageAddress })).toBe(
			prefix + 'ABCDEFGH-all-dates-1accounts-r9007199254740999.csv'
		);
	}
});
it('writes a literal mixed-asset golden with exact scales and native fees', () => {
	const assets = new Map([
		[9007199254740995n, { id: 9007199254740995n, decimals: 8, unitName: 'EIGHT', name: 'Eight' }],
		[2n, { id: 2n, decimals: 0, unitName: '', name: '' }],
		[3n, { id: 3n, decimals: 4, unitName: 'FOUR', name: 'Four' }],
		[4n, { id: 4n, decimals: 19, unitName: 'NINETEEN', name: 'Nineteen' }]
	]);
	const assetRow = {
		...row,
		assetKind: 'asa' as const,
		transactionType: 'axfer',
		type: 'asset-transfer' as const,
		note: ''
	};
	const csv = serializeCsv(
		[
			{ ...assetRow, assetId: 9007199254740995n },
			{ ...assetRow, assetId: 2n },
			{ ...assetRow, assetId: 3n, amount: 1234500n },
			{ ...assetRow, assetId: 4n, amount: 1n },
			{ ...row, type: 'fee', effect: 'fee', direction: 'fee', amount: 0n, fee: 1000n, note: '' }
		],
		{ ...context, assets }
	);
	expect(csv).toBe(
		header +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","axfer","asset-transfer","in","A","B","ASA/VSA","90071992.54740993","0","9007199254740993","","","","9007199254740999","complete-indexed","9007199254740995","EIGHT","Eight","8",""\r\n' +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","axfer","asset-transfer","in","A","B","ASA/VSA","9007199254740993","0","9007199254740993","","","","9007199254740999","complete-indexed","2","","","0",""\r\n' +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","axfer","asset-transfer","in","A","B","ASA/VSA","123.45","0","9007199254740993","","","","9007199254740999","complete-indexed","3","FOUR","Four","4",""\r\n' +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","axfer","asset-transfer","in","A","B","ASA/VSA","0.0000000000000000001","0","9007199254740993","","","","9007199254740999","complete-indexed","4","NINETEEN","Nineteen","19",""\r\n' +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","pay","fee","fee","A","B","VOI","0","0.001","9007199254740993","","","","9007199254740999","complete-indexed","","VOI","VOI (native)","6",""\r\n'
	);
	expect(csv.split('\r\n')[0].split(',')).toHaveLength(23);
	expect(csv).not.toMatch(/\d[eE][+-]\d/);
});
it.each([
	undefined,
	{ id: 2n, decimals: 6, unitName: '', name: '' },
	{ id: 1n, decimals: 20, unitName: '', name: '' }
])('refuses missing or invalid asset metadata %s', (metadata) => {
	expect(() =>
		serializeCsv([{ ...row, assetKind: 'asa', assetId: 1n }], {
			...context,
			assets: metadata ? new Map([[1n, metadata]]) : new Map()
		})
	).toThrow(/metadata/i);
});
it.each(['=1', ' \u0001-cmd', '\tvalue', ' @x,"quoted"\r\nnext'])(
	'protects indexed asset text %j',
	(value) => {
		const assets = new Map([[1n, { id: 1n, decimals: 0, unitName: value, name: value }]]);
		const csv = serializeCsv([{ ...row, assetKind: 'asa', assetId: 1n, note: '' }], {
			...context,
			assets
		});
		expect(csv).toContain([csvCell("'" + value), csvCell("'" + value), '"0"'].join(','));
	}
);

const contracts = new Map([
	['CONTRACT', '9007199254740993'],
	['SECOND', '12'],
	['SAME_ID', '12']
]);
function stakingCell(exportRow: ExportRow, stakingContracts = contracts) {
	const csv = serializeCsv([{ ...exportRow, note: '' }], { ...context, stakingContracts });
	return csv.split('\r\n')[1].split(',').at(-1);
}
it.each([
	['outgoing', 'B', 'CONTRACT', 'out', '9007199254740993'],
	['incoming', 'CONTRACT', 'B', 'in', '9007199254740993'],
	['unknown application', 'B', 'UNKNOWN_APP', 'out', ''],
	['two contracts', 'CONTRACT', 'SECOND', 'out', '12 9007199254740993'],
	['reverse endpoints', 'SECOND', 'CONTRACT', 'in', '12 9007199254740993'],
	['same contract', 'CONTRACT', 'CONTRACT', 'self', '9007199254740993'],
	['same ID', 'SECOND', 'SAME_ID', 'out', '12']
] as const)(
	'marks %s payments using only the row endpoints',
	(_, from, to, direction, expected) => {
		expect(stakingCell({ ...row, from, to, direction })).toBe('"' + expected + '"');
	}
);
it('marks inner payments and preserves reward payout precedence', () => {
	const rows = mapTransaction(
		{
			id: 'APP',
			round: 1n,
			timestamp: 0,
			group: '',
			type: 'appl',
			sender: 'B',
			fee: 0n,
			note: '',
			rewards: { sender: 0n, receiver: 0n, close: 0n },
			applicationId: 99n,
			inner: [
				{
					type: 'pay',
					sender: 'CONTRACT',
					fee: 0n,
					note: '',
					rewards: { sender: 0n, receiver: 0n, close: 0n },
					inner: [],
					payment: { receiver: 'B', amount: 1n, closeAmount: 0n }
				}
			]
		},
		new Set(['B']),
		new Set(['CONTRACT'])
	);
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({ innerPath: '0', from: 'CONTRACT', type: 'epoch-reward' });
	expect(stakingCell(rows[0])).toBe('"9007199254740993"');
});
it('marks asset transfers, close-outs and fees using their own serialized endpoints', () => {
	const rows = mapTransaction(
		{
			id: 'ASSET',
			round: 1n,
			timestamp: 0,
			group: '',
			type: 'axfer',
			sender: 'SECOND',
			fee: 1n,
			note: '',
			rewards: { sender: 0n, receiver: 0n, close: 0n },
			inner: [],
			assetTransfer: {
				assetId: 1n,
				sender: 'B',
				receiver: 'UNKNOWN_APP',
				amount: 2n,
				closeAmount: 3n,
				closeTo: 'CONTRACT'
			}
		},
		new Set(['B', 'SECOND']),
		new Set()
	);
	const csv = serializeCsv(rows, {
		...context,
		stakingContracts: contracts,
		assets: new Map([[1n, { id: 1n, decimals: 0, unitName: '', name: '' }]])
	});
	expect(rows.map(({ type, from, to }) => [type, from, to])).toEqual([
		['asset-transfer', 'B', 'UNKNOWN_APP'],
		['close-out', 'B', 'CONTRACT'],
		['fee', 'SECOND', '']
	]);
	expect(
		csv
			.trimEnd()
			.split('\r\n')
			.slice(1)
			.map((line) => line.split(',').at(-1))
	).toEqual(['""', '"9007199254740993"', '"12"']);
	expect(stakingCell({ ...row, type: 'asset-transfer', from: 'CONTRACT' })).toBe(
		'"9007199254740993"'
	);
});
it('keeps all 23 columns and empty staking cells when contracts are unavailable', () => {
	const rows = (
		[
			'payment',
			'epoch-reward',
			'block-reward',
			'protocol-reward',
			'asset-transfer',
			'close-out',
			'fee'
		] as const
	).map((type) => ({ ...row, type, from: 'CONTRACT', note: '' }));
	const lines = serializeCsv(rows, context).trimEnd().split('\r\n');
	expect(lines[0].split(',')).toHaveLength(23);
	expect(lines[0].split(',').at(-1)).toBe('"Staking contract"');
	for (const line of lines.slice(1)) {
		expect(line.split(',')).toHaveLength(23);
		expect(line.split(',').at(-1)).toBe('""');
	}
});
it('quotes staking IDs as plain decimal digits without spreadsheet formula prefixes', () => {
	expect(stakingCell({ ...row, from: 'CONTRACT' })).toMatch(/^"[0-9]+"$/);
	expect(stakingCell({ ...row, from: 'UNKNOWN_APP' })).toBe('""');
});

it('writes a literal ARC golden with raw units, duplicate records, independent native fees and staking endpoints', () => {
	const arc: ExportRow = {
		...row,
		assetKind: 'arc200',
		assetId: 1n,
		applicationId: 1n,
		transactionType: 'appl',
		type: 'asset-transfer',
		txId: '',
		note: '=1',
		round: 1n,
		arc200Occurrence: 0
	};
	const arc200Assets = new Map([
		[1n, { id: 1n, decimals: 0, unitName: '=UNIT', name: 'Token' }],
		[2n, { id: 2n, decimals: 18, unitName: '', name: '' }],
		[3n, { id: 3n, decimals: null, unitName: '', name: '' }]
	]);
	const csv = serializeCsv(
		[
			arc,
			{ ...arc, arc200Occurrence: 1 },
			{ ...arc, assetId: 2n, applicationId: 2n, arc200Occurrence: 2 },
			{ ...arc, assetId: 3n, applicationId: 3n, arc200Occurrence: 3 },
			{
				...row,
				round: 1n,
				type: 'fee',
				effect: 'fee',
				direction: 'fee',
				amount: 0n,
				fee: 1000n,
				note: ''
			}
		],
		{ ...context, arc200Assets, status: 'partial-source', stakingContracts: new Map([['A', '12']]) }
	);
	expect(csv).toBe(
		header +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","pay","fee","fee","A","B","VOI","0","0.001","1","","","","9007199254740999","partial-source","","VOI","VOI (native)","6","12"\r\n' +
			'"1970-01-01T00:00:00.000Z","B","","","appl","asset-transfer","in","A","B","ARC-200 (raw units)","9007199254740993","0","1","","3","\'=1","9007199254740999","partial-source","3","","","","12"\r\n' +
			'"1970-01-01T00:00:00.000Z","B","","","appl","asset-transfer","in","A","B","ARC-200","0.009007199254740993","0","1","","2","\'=1","9007199254740999","partial-source","2","","","18","12"\r\n' +
			'"1970-01-01T00:00:00.000Z","B","","","appl","asset-transfer","in","A","B","ARC-200","9007199254740993","0","1","","1","\'=1","9007199254740999","partial-source","1","\'=UNIT","Token","0","12"\r\n' +
			'"1970-01-01T00:00:00.000Z","B","","","appl","asset-transfer","in","A","B","ARC-200","9007199254740993","0","1","","1","\'=1","9007199254740999","partial-source","1","\'=UNIT","Token","0","12"\r\n'
	);
	expect(csv.split('\r\n')[0].split(',')).toHaveLength(23);
});

it('writes a legacy protocol reward as an incoming native credit with no sender', () => {
	const rows = mapTransaction(
		{
			id: 'KO34YPCDK4WOQCYK7MXHFULLVPUO5Q2NSEFM3CVHNSMWUTFAQA4A',
			round: 8325339n,
			timestamp: 0,
			group: '',
			type: 'pay',
			sender: 'S',
			fee: 1000n,
			note: '',
			rewards: { sender: 407n, receiver: 44048243n, close: 0n },
			inner: [],
			payment: { receiver: 'R', amount: 0n, closeAmount: 0n }
		},
		new Set(['R']),
		new Set()
	);
	const csv = serializeCsv(
		rows.filter((r) => r.type === 'protocol-reward'),
		context
	);
	expect(csv).toBe(
		header +
			'"1970-01-01T00:00:00.000Z","R","KO34YPCDK4WOQCYK7MXHFULLVPUO5Q2NSEFM3CVHNSMWUTFAQA4A","","pay","protocol-reward","in","","R","VOI","44.048243","0","8325339","","","","9007199254740999","complete-indexed","","VOI","VOI (native)","6",""\r\n'
	);
});
