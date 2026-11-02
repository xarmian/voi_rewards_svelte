import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./SendTokenModal.svelte', import.meta.url), 'utf8');

function body(name: string) {
	const match = source.match(new RegExp(`\\t(?:async )?function ${name}\\([^]*?\\n\\t\\}`));
	expect(match, `Keep the ${name} function`).not.toBeNull();
	return match![0];
}

test('each modal lookup accepts and applies the queued ticket without mutating a captured row', () => {
	expect(source, 'Import the shared ticket generator').toMatch(
		/import\s*\{[^}]*\bnextLookupId\b[^}]*\}\s*from\s*['"]\$lib\/chain\/recipientInfo['"]/
	);
	const lookup = body('fetchRecipientInfo');
	const awaitLookup = lookup.indexOf('await loadRecipientInfo(');
	expect(awaitLookup, 'Keep the shared recipient loader').toBeGreaterThan(-1);
	expect(lookup).toMatch(/fetchRecipientInfo\(address: string, ticket: number\)/);
	expect(lookup).not.toMatch(/nextLookupId\(|\brow\b/);
	expect(lookup.slice(awaitLookup), 'Apply only the ticket captured by this lookup').toMatch(
		/applyRecipientLookup\(recipients,\s*address,\s*ticket,\s*result\)/
	);
});

test.each(['recheckRecipients', 'handlePasteModalConfirm'])(
	'%s invalidates tickets synchronously before starting the worker pool',
	(handler) => {
		const handlerBody = body(handler);
		const beforePool = handlerBody.split('await runBounded(')[0];
		expect(beforePool, `${handler} must use the shared invalidation before queueing`).toMatch(
			/const \{ rows, work \} = invalidateRows\(/
		);
		expect(beforePool, 'Install the invalidated rows before workers start').toMatch(
			/recipients\s*=\s*rows/
		);
		expect(handlerBody, 'Queue address/ticket pairs rather than row objects').toMatch(
			/runBounded\(work, 4, async \(\{ address, ticket \}\) => \{\s*await fetchRecipientInfo\(address, ticket\)/
		);
		const invalidation = body('invalidateRows');
		expect(invalidation, 'Build work from the same map that creates each ticket').toMatch(
			/rows\.map\([^]*?lookupId:\s*nextLookupId\(\)[^]*?work\.push\(\{ address: row\.address, ticket: \w+\.lookupId \}\)/
		);
		for (const field of ['isValid: false', 'info: null', 'lookupError: null', 'isLoading:']) {
			expect(invalidation, `${handler} must reset ${field} before any queued check`).toContain(
				field
			);
		}
	}
);

test('retrying transactions rechecks the restored rows under the current token', () => {
	expect(body('handleRetryFailedTransactions'), 'Recheck after restoring the retry rows').toMatch(
		/recipients\s*=\s*toRetry;[^]*?recheckRecipients\(\)/
	);
});

test.each(['fetchRecipientInfo', 'handleRecipientError'])(
	'%s keeps current lookup errors and clears only the lookup banner',
	(handler) => {
		const banner = body(handler);
		expect(banner, 'Keep the banner while any current row is unavailable').toMatch(
			/if \(recipients\.some\(\(r\) => r\.lookupError\)\) \{\s*error = "Couldn't check this recipient\. Sending is blocked until it can be checked\."/
		);
		expect(banner, 'Compare the exact banner before clearing any error').toMatch(
			/else if \(\s*error === "Couldn't check this recipient\. Sending is blocked until it can be checked\."\s*\) \{\s*error = null;/
		);
	}
);
