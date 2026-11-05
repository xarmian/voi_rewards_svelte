import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Source-text pin (there is no DOM runner, TASK-124). The v2 wallet library submits and confirms
// inside signAndSendTransactions, so a failed wait arrives as a submission error. Every key
// registration send must map one that may have landed to the "check the explorer" error with the
// local transaction id, or the user retries and registers twice.
const source = readFileSync(new URL('./RegisterVoteKey.svelte', import.meta.url), 'utf8');

test('both staking-contract flows route a failed send through keyregSendFailure with the local txid', () => {
	expect(source.match(/signAndSendTransactions\(\[txns\], signer\)/g)).toHaveLength(2);
	const guarded = source.match(
		/signAndSendTransactions\(\[txns\], signer\);\s*\} catch \(sendError\) \{[^}]*throw keyregSendFailure\(sendError, txid\);/g
	);
	expect(guarded).toHaveLength(2);
});

test('the plain-account flows send through sendWalletKeyreg, which makes the same mapping', () => {
	expect(source.match(/await sendWalletKeyreg\(/g)).toHaveLength(2);
	expect(
		source.match(/signAndSend: \(groups\) => signAndSendTransactions\(groups, signer\)/g)
	).toHaveLength(2);
	// No send path calls the library without one of the two guards.
	expect(source.match(/signAndSendTransactions\(/g)).toHaveLength(4);
});
