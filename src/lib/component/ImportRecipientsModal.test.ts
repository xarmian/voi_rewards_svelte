import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./ImportRecipientsModal.svelte', import.meta.url), 'utf8');

// amountValue is bound with bind:value to type="number" Inputs, so once the user types it holds a
// number at runtime although it is declared as a string. A recipient amount must be the string
// the send path parses with decimalToBaseUnits, so every per-holder assignment coerces it.
test('per-holder import amounts are coerced to a string', () => {
	expect(
		source,
		'assign String(amountValue), never amountValue itself, to a recipient amount'
	).not.toMatch(/\bamount\s*=\s*amountValue\s*;/);
	expect(source.match(/\bamount\s*=\s*String\(amountValue\)\s*;/g)).toHaveLength(2);
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
