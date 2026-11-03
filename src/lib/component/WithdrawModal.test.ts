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
		/\{:else if txStatus === 'pending'(?: \|\| txStatus === 'confirming')?\}([\s\S]*?)(?=\{:else if txStatus)/
	)?.[1];
	expect(pendingBranch, 'WithdrawModal must render a distinct pending branch').toBeDefined();
	expect(
		pendingBranch,
		'Pending withdrawals must clearly say they are not yet confirmed'
	).toContain('A withdrawal is in progress');
	expect(
		pendingBranch?.replace('Waiting for it to be confirmed on the network.', ''),
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
	expect(source, 'An unresolved withdrawal must be recorded before broadcast').toContain(
		'sendWithdrawal('
	);
	expect(source, 'A reopened modal must look up an unresolved withdrawal').toContain(
		'getPendingWithdrawal('
	);
	expect(source, 'A confirmed withdrawal must clear the unresolved record').toContain(
		'clearPendingWithdrawal('
	);
});

test('WithdrawModal releases a withdrawal that can no longer land', () => {
	expect(source, 'An unresolved withdrawal must be checked with trackPending').toMatch(
		/import\s*\{[^}]*\btrackPending\b[^}]*\}\s*from\s*['"]\$lib\/chain\/sendAndConfirm['"]/
	);
	expect(source, 'The stored last valid round must be used when resuming').toMatch(
		/trackWithdrawal\(earlier\.txId, earlier\.lastValid\)/
	);
	expect(source, 'An expired withdrawal must be handled and its record cleared').toMatch(
		/status === 'expired'[\s\S]*clearPendingWithdrawal\(/
	);
});

test('WithdrawModal does not report a resumed withdrawal with a made-up amount', () => {
	expect(
		source,
		'A resumed withdrawal has no typed amount; the confirmed text must not print 0.00'
	).toMatch(/\{#if withdrawAmountVOI\}[\s\S]*\{:else\}[\s\S]*Your withdrawal has been confirmed/);
});

test('WithdrawModal records a withdrawal through the send flow before tracking it', () => {
	const sent = source.indexOf('await sendWithdrawal(');
	const polled = source.indexOf('await trackWithdrawal(', sent);
	expect(sent, 'The send flow records before broadcasting').toBeGreaterThanOrEqual(0);
	expect(polled, 'The recorded pending outcome must then be tracked').toBeGreaterThan(sent);
});

test('WithdrawModal only clears the record of the withdrawal it was waiting on', () => {
	const body = source.match(/async function trackWithdrawal[\s\S]*?\n\t\}\n/)?.[0] ?? '';
	const clears = body.match(/clearPendingWithdrawal\([^)]*\)/g) ?? [];
	expect(clears.length, 'trackWithdrawal must clear on confirmed and on expired').toBeGreaterThan(
		1
	);
	for (const call of clears) {
		expect(
			call,
			'A detached wait must not erase a newer withdrawal: pass the tx id to every clear'
		).toMatch(/,\s*id\s*\)/);
	}
});
