import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./ImportRecipientsModal.svelte', import.meta.url), 'utf8');
// The ARC-200 holder step that builds recipient amounts lives in this module, beside the filters.
const holderSource = readFileSync(new URL('../utils/arc200Holders.ts', import.meta.url), 'utf8');

// amountValue is bound with bind:value to type="number" Inputs, so once the user types it holds a
// number at runtime although it is declared as a string. A recipient amount must be the string
// the send path parses with decimalToBaseUnits, so every per-holder assignment coerces it.
test('per-holder import amounts are coerced to a string', () => {
	const both = `${source}\n${holderSource}`;
	expect(
		both,
		'assign String(amountValue), never amountValue itself, to a recipient amount'
	).not.toMatch(/\bamount\s*=\s*amountValue\s*;/);
	expect(both.match(/\bamount\s*=\s*String\(amountValue\)\s*;/g)).toHaveLength(2);
});

test('import cells show full resolved addresses and explain invalid name kinds', () => {
	expect(source, 'Imported name receivers must never be shortened').not.toMatch(
		/resolvedAddress\.slice\(/
	);
	expect(source).toMatch(
		/class="[^"]*font-mono[^"]*break-all[^"]*"[^>]*>\s*\{row.resolvedAddress\}/
	);
	expect(source).toContain('This name did not resolve to an address.');
	expect(source).toContain('This import takes Voi addresses and .voi names.');
});

async function importFunctions(names: string[], globals: Record<string, unknown>) {
	const { createContext, runInContext } = await import('node:vm');
	const ts = await import('typescript');
	const helpers = await import('../chain/sendAmounts').catch(() => ({}));
	const script = names
		.map(
			(name) =>
				source.match(new RegExp(`\\t(?:async )?function ${name}\\([\\s\\S]*?\\n\\t\\}`))?.[0] || ''
		)
		.join('\n');
	const context = createContext({ ...helpers, ...globals });
	runInContext(
		ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
		context
	);
	return (code: string) => runInContext(code, context);
}

test.each(['1e3', '0x10', '1,000', '-1', ' '])(
	'import rejects %j with existing error messages',
	async (amountValue) => {
		for (const distribution of ['per-holder', 'proportional', 'per-nft']) {
			const run = await importFunctions(['handleArc200TokenImport', 'handleNFTCollectionImport'], {
				amountValue,
				arc200TokenId: '1',
				isArc200TokenValid: true,
				collectionId: '1',
				arc200DistributionType: distribution,
				amountType: distribution,
				error: null
				// These sentinels fail if validation lets a bad amount reach later processing.
			});
			await run(
				distribution === 'per-nft' ? 'handleNFTCollectionImport()' : 'handleArc200TokenImport()'
			);
			expect(run('error')).toBe(
				distribution === 'proportional'
					? 'Please enter a valid total amount for the pool'
					: 'Please enter a valid amount'
			);
		}
	}
);

test.each(['0.1', '0.0000001'])('per-NFT import multiplies %s exactly', async (amountValue) => {
	let imported: { amount: string }[] = [];
	const run = await importFunctions(['handleNFTCollectionImport', 'fractionDigits'], {
		amountValue,
		amountType: 'per-nft',
		collectionId: '1',
		roundNumber: '',
		zeroAddress: 'ZERO',
		URL,
		fetch: async () => ({
			ok: true,
			json: async () => ({ tokens: Array(3).fill({ owner: 'OWNER' }) })
		}),
		onConfirm: (rows: { amount: string }[]) => {
			imported = rows;
		},
		handleClose: () => {},
		error: null
	});
	await run('handleNFTCollectionImport()');
	expect(imported.map((r) => r.amount)).toEqual([amountValue === '0.1' ? '0.3' : '0.0000003']);
});

test('CSV imports leave invalid amount cells blank', async () => {
	const values = ['1e3', '0x10', '1,000', '-1', ' ', '0.5'];
	let imported: { amount: string }[] = [];
	const run = await importFunctions(['handleConfirm'], {
		parsedData: values.map((amount) => ({ cells: ['ADDRESS', amount], isValid: true })),
		addressColumnIndex: 0,
		amountColumnIndex: 1,
		noteColumnIndex: -1,
		selectedRows: new Set(values.map((_, i) => i)),
		isValidAddressContent: () => true,
		onConfirm: (rows: { amount: string }[]) => {
			imported = rows;
		},
		handleClose: () => {},
		error: null
	});
	await run('handleConfirm()');
	expect(imported.map((r) => r.amount)).toEqual(['', '', '', '', '', '0.5']);
});

test('amount inputs preserve typed strings for validation and multiplication', () => {
	expect(source).not.toContain('bind:value={amountValue}');
});

test('column detection distinguishes positive decimal amounts from other text', async () => {
	const run = await importFunctions(['autoDetectColumns'], {
		parsedData: [{ cells: ['ADDRESS', '1e3', '0.5'] }, { cells: ['ADDRESS', '0x10', '.5'] }],
		columnCount: 3,
		algosdk: { isValidAddress: (value: string) => value === 'ADDRESS' }
	});
	run('autoDetectColumns()');
	expect(run('amountColumnIndex')).toBe(2);
	expect(run('noteColumnIndex')).toBe(1);
});
