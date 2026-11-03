import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const modal = readFileSync(new URL('./TokenTransfersModal.svelte', import.meta.url), 'utf8');
const template = modal.split('</script>')[1];
const row = readFileSync(new URL('./TransferRow.svelte', import.meta.url), 'utf8');

test('errors do not replace previously loaded transfer rows', () => {
	expect(template, 'The error branch must not own the empty/list else chain').not.toMatch(
		/\{#if error\}[^]*?\{:else if filteredTransfers\.length === 0/
	);
	expect(template, 'Render the list independently of the error banner').toMatch(
		/\{#if filteredTransfers\.length > 0\}[^]*?<TransferRow\b/
	);
});

test('first-load and append errors include Retry above and below the list respectively', () => {
	const list = template.indexOf('<TransferRow');
	const first = template.match(/\{#if error && !failedRequest\?\.append\}([^]*?)\{\/if\}/);
	const append = template.match(/\{#if error && failedRequest\?\.append\}([^]*?)\{\/if\}/);
	expect(first, 'First-load error must appear above the list').not.toBeNull();
	expect(append, 'Append error must appear below the list').not.toBeNull();
	expect(first!.index).toBeLessThan(list);
	expect(append!.index).toBeGreaterThan(list);
	for (const block of [first, append]) {
		expect(block![1], 'Error markup must include its text and wired Retry button').toMatch(
			/\{error\}[^]*?<button\b[^>]*on:click=\{retryTransfers\}[^>]*>\s*Retry\s*<\/button>/
		);
	}
});

test('No transfers found is guarded against failed loads', () => {
	expect(template, 'Empty history is only shown after a successful load').toMatch(
		/\{(?:#if|:else if) [^}]*filteredTransfers\.length === 0[^}]*!isLoading[^}]*!error[^}]*\}[^]*?No transfers found/
	);
});

test('one LP label note has a Retry that reloads history', () => {
	const text = "Some add and remove liquidity labels couldn't be loaded.";
	expect(
		template.split(text),
		'Render the LP label note once per history, outside the row loop'
	).toHaveLength(2);
	expect(
		template,
		'The label note is guarded by failures on loaded transfers and has Retry'
	).toMatch(
		/\{#if transfers\.some\(\(transfer\) => transfer\.lpLabelUnavailable\)\}[^]*?Some add and remove liquidity labels couldn't be loaded\.[^]*?on:click=\{retryLpLabels\}[^>]*>\s*Retry/
	);
});

test('TransferRow identifies unavailable labels in gray text', () => {
	expect(row, 'A failed LP lookup must be visible in the row').toMatch(
		/\{#if transfer\.lpLabelUnavailable\}\s*<span[^>]*class="[^"]*text-xs[^"]*text-gray-[^"]*"[^>]*>\s*Label unavailable\s*<\/span>\s*\{\/if\}/
	);
});
