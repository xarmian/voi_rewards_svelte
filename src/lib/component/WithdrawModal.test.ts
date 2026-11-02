import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./WithdrawModal.svelte', import.meta.url), 'utf8');

test('WithdrawModal imports the withdrawal confirmation poller', () => {
	expect(source, 'WithdrawModal must import awaitWithdrawalConfirmation').toMatch(
		/import\s*\{\s*awaitWithdrawalConfirmation\s*\}\s*from\s*['"]\$lib\/chain\/withdrawConfirmation['"]/
	);
});

test('WithdrawModal does not confirm from a bare pending transaction lookup', () => {
	expect(
		source,
		'A non-throwing lookup is not confirmation; delegate lookups to awaitWithdrawalConfirmation'
	).not.toContain('await algodClient.pendingTransactionInformation(txId).do();');
});

test('WithdrawModal includes a pending transaction status', () => {
	expect(source, 'txStatus must include pending for an unresolved withdrawal').toMatch(
		/let txStatus:\s*[^;]*'pending'/
	);
});

test('WithdrawModal renders pending without claiming success or confirmation', () => {
	const pendingBranch = source.match(
		/\{:else if txStatus === 'pending'\}([\s\S]*?)(?=\{:else(?: if txStatus|\}))/
	)?.[1];
	expect(pendingBranch, 'WithdrawModal must render a distinct pending branch').toBeDefined();
	expect(
		pendingBranch,
		'Pending withdrawals must clearly say they are not yet confirmed'
	).toContain('Withdrawal submitted, not yet confirmed');
	expect(
		pendingBranch?.replace('not yet confirmed', ''),
		'The pending branch must not claim the withdrawal is confirmed or successful'
	).not.toMatch(/\bconfirmed\b|\bsuccess(?:ful)?\b/i);
	expect(pendingBranch, 'Pending withdrawals must retain the explorer link').toContain(
		'href={explorerUrl}'
	);
	expect(pendingBranch, 'Pool errors must use normal escaped Svelte interpolation').toMatch(
		/\{#if poolError\}[\s\S]*\{poolError\}/
	);
	expect(pendingBranch, 'Pool errors must never be rendered as raw HTML').not.toMatch(/\{@html\b/);
});

test('WithdrawModal resumes an unresolved withdrawal instead of offering a second one', () => {
	expect(source, 'WithdrawModal must import the pending-withdrawal registry').toMatch(
		/from\s*['"]\$lib\/chain\/pendingWithdrawals['"]/
	);
	expect(source, 'An unresolved withdrawal must be remembered for its contract').toContain(
		'rememberPendingWithdrawal('
	);
	expect(source, 'A reopened modal must look up an unresolved withdrawal').toContain(
		'getPendingWithdrawal('
	);
	expect(source, 'A confirmed withdrawal must clear the unresolved record').toContain(
		'clearPendingWithdrawal('
	);
});
