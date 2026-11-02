import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./SendTokenModal.svelte', import.meta.url), 'utf8');
const handleImport = source.match(
	/\t(?:async )?function handlePasteModalConfirm\([^]*?\n\t\}/
)?.[0];

test('imported recipients wait for a successful check before becoming valid', () => {
	expect(handleImport, 'Keep the import confirmation handler').toBeDefined();
	expect(handleImport, 'Normalize imported rows as invalid before checking them').toMatch(
		/isValid:\s*false/
	);
	for (const field of ['info: null', 'lookupError: null', 'isLoading: Boolean(row.address)']) {
		expect(handleImport, `Imported rows must start with ${field}`).toContain(field);
	}
});

test('imports use the bounded worker pool with a concurrency limit of four', () => {
	expect(source, 'Use the shared bounded pool').toMatch(
		/import\s*\{\s*runBounded\s*\}\s*from\s*['"]\$lib\/chain\/boundedPool['"]/
	);
	expect(handleImport, 'Run imported recipient checks with at most four workers').toMatch(
		/runBounded\([^]*?,\s*4\s*,[^]*?fetchRecipientInfo\(/
	);
});

test('recipient checks apply completed lookups by address', () => {
	const lookup = source.match(/\tasync function fetchRecipientInfo\([^]*?\n\t\}/)?.[0];
	expect(lookup, 'Keep one shared recipient check for typed and imported addresses').toBeDefined();
	const awaitLookup = lookup!.indexOf('await loadRecipientInfo(');
	expect(awaitLookup, 'Check recipient details with the shared loader').toBeGreaterThan(-1);
	expect(lookup, 'Cloning a row must not invalidate its pending lookup').not.toMatch(
		/recipients\.indexOf\(/
	);
	expect(lookup!.slice(awaitLookup), 'Apply results to current waiting rows by address').toMatch(
		/applyRecipientLookup\(recipients, address, ticket, result\)/
	);
});

test('all token types require recipient info before submission', () => {
	const canSubmit = source.match(/\$:\s*canSubmit\s*=([^]*?)\n\t\$:\s*isValidAmount/)?.[1];
	expect(canSubmit, 'Keep the recipient submission guard').toBeDefined();
	const tokenBranch = canSubmit!.indexOf('if (!isNativeToken(');
	expect(tokenBranch, 'Keep the token-specific opt-in check').toBeGreaterThan(-1);
	expect(
		canSubmit!.slice(0, tokenBranch),
		'Require non-null recipient info before the token-specific branch'
	).toMatch(/r\.info\s*!==\s*null|&&\s*r\.info\b/);
});
