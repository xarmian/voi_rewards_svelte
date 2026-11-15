import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import { csvCell, protectText, serializeCsv, exportFilename } from './transactionCsv';
import { normalizeOptions, type ExportRow } from './transactionExport';
import Panel from '../component/TransactionExportPanel.svelte';

const header =
	'"Timestamp (UTC)","Account","Tx ID","Inner path","Transaction type","Type","Direction","From","To","Asset","Amount","Fee (VOI)","Round","Group ID","Application ID","Note","Snapshot round","Export status"\r\n';
const row: ExportRow = {
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
const context = { snapshotRound: 9007199254740999n, status: 'complete-indexed' as const };

it('writes exact RFC 4180 bytes with one header, quoted cells and final CRLF', () => {
	expect(serializeCsv([row], context)).toBe(
		header +
			'"1970-01-01T00:00:00.000Z","B","ROOT","","pay","payment","in","A","B","VOI","9007199254.740993","0","9007199254740993","","","Hi,""世界""\r\nnext","9007199254740999","complete-indexed"\r\n'
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
it('shows the native-only disclosure before Start', () => {
	const { body } = render(Panel, {
		props: { pageAddress: 'A', suggestions: [], suggestionsAvailable: false, onclose: () => {} }
	});
	expect(body.replace(/\s+/g, ' ')).toContain(
		'This export covers native VOI only. Tokens (ASA/VSA and ARC-200), LP positions and NFTs are not included.'
	);
	expect(body).toContain('Start export');
	expect(body.indexOf('This export covers native VOI only.')).toBeLessThan(
		body.indexOf('Start export')
	);
});
