import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./SendTokenModal.svelte', import.meta.url), 'utf8');
function body(name: string) {
	const match = source.match(new RegExp(`\\t(?:async )?function ${name}\\([^]*?\\n\\t\\}`));
	expect(match, `Keep the ${name} function`).not.toBeNull();
	return match![0];
}

test('tokenKey distinguishes native tokens and token type/id pairs', () => {
	const key = body('tokenKey');
	expect(key, 'Native tokens must share the native key').toMatch(
		/isNativeToken\(\w+\)[^]*?['"]native['"]/
	);
	expect(key, 'Asset keys must include both type and id').toMatch(
		/`\$\{\w+\.type\}:\$\{\w+\.id\}`/
	);
});

test('recipient lookup drops results for a token that is no longer selected', () => {
	const lookup = body('fetchRecipientInfo');
	const awaitLookup = lookup.indexOf('await loadRecipientInfo(');
	expect(awaitLookup, 'Keep the shared recipient loader').toBeGreaterThan(-1);
	expect(lookup.slice(0, awaitLookup), 'Capture the token key before awaiting').toMatch(
		/const\s+\w+\s*=\s*tokenKey\(/
	);
	expect(lookup.slice(awaitLookup), 'Drop stale token results before applying them').toMatch(
		/if\s*\(tokenKey\(selectedToken\)\s*!==\s*\w+\)\s*return/
	);
	expect(lookup, 'Apply completed checks by address through the pure helper').toContain(
		'applyRecipientLookup('
	);
	expect(lookup, 'Row cloning must not discard a completed check').not.toMatch(/indexOf\(row\)/);
});

test('both token selection paths invalidate and recheck addressed rows with four workers', () => {
	const recheck = body('recheckRecipients');
	for (const field of ['isValid: false', 'info: null', 'lookupError: null', 'isLoading: true']) {
		expect(recheck, `Token changes must reset ${field}`).toContain(field);
	}
	expect(recheck, 'Leave rows without addresses alone').toMatch(/row\.address\s*\?/);
	expect(recheck, 'Recheck recipients with at most four workers').toMatch(
		/runBounded\([^]*?,\s*4\s*,[^]*?fetchRecipientInfo\(/
	);
	for (const handler of ['handleTokenChange', 'syncTokenProp']) {
		const change = body(handler);
		expect(change, `${handler} must compare token keys before rechecking`).toMatch(
			/tokenKey\(selectedToken\)\s*!==\s*\w+/
		);
		expect(change, `${handler} must run the bounded recipient recheck`).toContain(
			'recheckRecipients('
		);
		expect(change, `${handler} must preserve the token during a send`).toMatch(
			/if \(isSending\) return;/
		);
	}
	expect(source, 'Prop updates must use the same invalidation path').toMatch(
		/\$:\s*if \(token\)\s*\{?\s*syncTokenProp\(token\)/
	);
});

test('imported rows without addresses do not show a loading indicator', () => {
	expect(body('handlePasteModalConfirm'), 'Only addressed imports need a lookup').toMatch(
		/isLoading:\s*Boolean\(row\.address\)/
	);
});
