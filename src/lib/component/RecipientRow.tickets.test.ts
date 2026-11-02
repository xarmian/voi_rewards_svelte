import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./RecipientRow.svelte', import.meta.url), 'utf8');
const lookup = source.match(/\tasync function fetchRecipientInfo\([^]*?\n\t\}/)?.[0];

test('typed lookups import and capture a fresh ticket and token key before awaiting', () => {
	for (const helper of ['nextLookupId', 'tokenKey']) {
		expect(source, `Import shared ${helper} for typed lookups`).toMatch(
			new RegExp(
				`import\\s*\\{[^}]*\\b${helper}\\b[^}]*\\}\\s*from\\s*['"]\\$lib/chain/recipientInfo['"]`
			)
		);
	}
	expect(lookup, 'Keep the typed recipient lookup').toBeDefined();
	const awaitLookup = lookup!.indexOf('await loadRecipientInfo(');
	expect(awaitLookup, 'Keep the shared recipient loader').toBeGreaterThan(-1);
	const beforeAwait = lookup!.slice(0, awaitLookup);
	expect(beforeAwait, 'Supersede any previous typed lookup before awaiting').toMatch(
		/recipient\.lookupId\s*=\s*nextLookupId\(\)/
	);
	expect(beforeAwait, 'Remember the assigned ticket').toMatch(
		/const\s+ticket\s*=\s*recipient\.lookupId/
	);
	expect(beforeAwait, 'Capture the selected token key').toMatch(
		/const\s+checkedTokenKey\s*=\s*tokenKey\(/
	);
});

test('typed results and loading completion are guarded by the current ticket, address and token', () => {
	expect(lookup, 'Keep the typed recipient lookup').toBeDefined();
	const afterAwait = lookup!.slice(lookup!.indexOf('await loadRecipientInfo('));
	const guard = afterAwait.match(
		/if\s*\(\s*!\(\s*recipient\.lookupId\s*===\s*ticket\s*&&\s*recipient\.address\s*===\s*address\s*&&\s*tokenKey\(selectedToken\)\s*===\s*checkedTokenKey\s*\)\s*\)\s*return;/
	);
	expect(
		guard,
		'Return stale results before changing row state or the error channel'
	).not.toBeNull();
	const guardEnd = afterAwait.indexOf(guard![0]) + guard![0].length;
	for (const mutation of [
		'recipient.info =',
		'recipient.isValid = true',
		'recipient.lookupError =',
		'onError(',
		'recipient.isLoading = false'
	]) {
		expect(
			afterAwait.indexOf(mutation),
			`Guard ${mutation} with all three current-lookup checks`
		).toBeGreaterThan(guardEnd);
	}
	expect(afterAwait, 'A stale return must not clear loading through finally').not.toMatch(
		/finally\s*\{/
	);
});
