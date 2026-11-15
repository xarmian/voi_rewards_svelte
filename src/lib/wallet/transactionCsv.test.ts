import { expect, it } from 'vitest';
import { csvCell, protectText, serializeCsv, exportFilename } from './transactionCsv';
import { normalizeOptions, type ExportRow } from './transactionExport';

const header =
	'"Timestamp (UTC)","Account","Tx ID","Inner path","Transaction type","Type","Direction","From","To","Asset","Amount","Fee (VOI)","Round","Group ID","Application ID","Note","Snapshot round","Export status","Asset ID","Asset unit","Asset name","Asset decimals"\r\n';
const row: ExportRow = {
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
	assets: new Map(),
	snapshotRound: 9007199254740999n,
	status: 'complete-indexed' as const
};

it('writes exact RFC 4180 bytes with one header, quoted cells and final CRLF', () => {
	expect(serializeCsv([row], context)).toBe(
		header +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","pay","payment","in","A","B","VOI","9007199254.740993","0","9007199254740993","","","Hi,""世界""\r\nnext","9007199254740999","complete-indexed","","VOI","VOI (native)","6"\r\n'
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
	for (const status of ['partial-cap', 'partial-error', 'partial-cancelled'] as const) {
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
	const assetRow = { ...row, transactionType: 'axfer', type: 'asset-transfer' as const, note: '' };
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
			'"1970-01-01T00:00:00.000Z","B","ROOT","","axfer","asset-transfer","in","A","B","ASA/VSA","90071992.54740993","0","9007199254740993","","","","9007199254740999","complete-indexed","9007199254740995","EIGHT","Eight","8"\r\n' +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","axfer","asset-transfer","in","A","B","ASA/VSA","9007199254740993","0","9007199254740993","","","","9007199254740999","complete-indexed","2","","","0"\r\n' +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","axfer","asset-transfer","in","A","B","ASA/VSA","123.45","0","9007199254740993","","","","9007199254740999","complete-indexed","3","FOUR","Four","4"\r\n' +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","axfer","asset-transfer","in","A","B","ASA/VSA","0.0000000000000000001","0","9007199254740993","","","","9007199254740999","complete-indexed","4","NINETEEN","Nineteen","19"\r\n' +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","pay","fee","fee","A","B","VOI","0","0.001","9007199254740993","","","","9007199254740999","complete-indexed","","VOI","VOI (native)","6"\r\n'
	);
	expect(csv.split('\r\n')[0].split(',')).toHaveLength(22);
	expect(csv).not.toMatch(/\d[eE][+-]\d/);
});
it.each([
	undefined,
	{ id: 2n, decimals: 6, unitName: '', name: '' },
	{ id: 1n, decimals: 20, unitName: '', name: '' }
])('refuses missing or invalid asset metadata %s', (metadata) => {
	expect(() =>
		serializeCsv([{ ...row, assetId: 1n }], {
			...context,
			assets: metadata ? new Map([[1n, metadata]]) : new Map()
		})
	).toThrow(/metadata/i);
});
it.each(['=1', ' \u0001-cmd', '\tvalue', ' @x,"quoted"\r\nnext'])(
	'protects indexed asset text %j',
	(value) => {
		const assets = new Map([[1n, { id: 1n, decimals: 0, unitName: value, name: value }]]);
		const csv = serializeCsv([{ ...row, assetId: 1n, note: '' }], { ...context, assets });
		expect(csv).toContain([csvCell("'" + value), csvCell("'" + value), '"0"'].join(','));
	}
);
