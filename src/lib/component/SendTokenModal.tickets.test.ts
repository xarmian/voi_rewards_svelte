import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./SendTokenModal.svelte', import.meta.url), 'utf8');

function body(name: string) {
	const match = source.match(new RegExp(`\\t(?:async )?function ${name}\\([^]*?\\n\\t\\}`));
	expect(match, `Keep the ${name} function`).not.toBeNull();
	return match![0];
}

test('each modal lookup assigns and applies its own ticket', () => {
	expect(source, 'Import the shared ticket generator').toMatch(
		/import\s*\{[^}]*\bnextLookupId\b[^}]*\}\s*from\s*['"]\$lib\/chain\/recipientInfo['"]/
	);
	const lookup = body('fetchRecipientInfo');
	const awaitLookup = lookup.indexOf('await loadRecipientInfo(');
	expect(awaitLookup, 'Keep the shared recipient loader').toBeGreaterThan(-1);
	expect(lookup.slice(0, awaitLookup), 'Supersede the row ticket before awaiting').toMatch(
		/row\.lookupId\s*=\s*nextLookupId\(\)/
	);
	expect(lookup.slice(0, awaitLookup), 'Remember this lookup ticket').toMatch(
		/const\s+ticket\s*=\s*row\.lookupId/
	);
	expect(lookup.slice(awaitLookup), 'Apply only the ticket captured by this lookup').toMatch(
		/applyRecipientLookup\(recipients,\s*address,\s*ticket,\s*result\)/
	);
});

test.each(['recheckRecipients', 'handlePasteModalConfirm'])(
	'%s invalidates tickets synchronously before starting the worker pool',
	(handler) => {
		const invalidation = body(handler).split('await runBounded(')[0];
		expect(invalidation, `${handler} must assign tickets in the invalidating map`).toMatch(
			/\.map\([^]*?\{[^}]*lookupId:\s*nextLookupId\(\)[^}]*\}/
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

test('the modal banner reflects all current lookup errors after applying a result', () => {
	const applied = body('fetchRecipientInfo').split('recipients = applyRecipientLookup(')[1];
	expect(applied, 'Apply the result before deriving the banner').toBeDefined();
	expect(applied, 'Keep the banner while any current row is unavailable').toMatch(
		/error\s*=\s*recipients\.some\([^]*?\.lookupError[^]*?\)\s*\?\s*["']Couldn't check this recipient\. Sending is blocked until it can be checked\.["']\s*:\s*null/
	);
});
