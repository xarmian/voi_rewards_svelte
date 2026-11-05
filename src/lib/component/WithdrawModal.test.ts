import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { signerMatchesAccount, wrongSignerMessage } from '$lib/chain/signerGate';
import { expect, test, vi } from 'vitest';

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
		/trackWithdrawal\(earlier\.txId, earlier\.lastValid, wallet\)/
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

test('WithdrawModal keys every withdrawal read by the wallet captured at submit', () => {
	const live = source
		.split('\n')
		.filter((line) => line.includes('$selectedWallet') && !line.includes('import '));
	expect(live.map((line) => line.trim())).toEqual([
		'$: activeWallet = flowWallet ?? $selectedWallet?.address;',
		// The submit-time guard. Nothing reads the live selection after it: the signer is captured
		// right below, and sendWithdrawal signs as it, so a picker move cannot change who signs.
		'if (!$selectedWallet?.address) {'
	]);
	const withdraw = source.slice(source.indexOf('async function handleWithdraw()'));
	const body = withdraw.slice(0, withdraw.indexOf('\n\t}\n'));
	expect(body.indexOf('captureSigner()')).toBeGreaterThan(0);
	expect(body.indexOf('captureSigner()')).toBeLessThan(body.indexOf('await '));
	expect(body).toContain('const wallet = signer.address;');
	expect(source).not.toContain('currentWallet');
	expect(source).toMatch(/let flowWallet: string \| undefined;/);
	expect(source).toMatch(/flowWallet = wallet;/);
});

test('a repeat call that returns at a guard leaves the captured wallet alone', () => {
	const withdraw = source.slice(source.indexOf('async function handleWithdraw()'));
	const body = withdraw.slice(0, withdraw.indexOf('\n\t}\n'));
	const assign = body.indexOf('flowWallet = wallet;');
	expect(assign).toBeGreaterThan(-1);
	// Every early return comes before the assignment, and none of them clears the capture.
	const guards = body.slice(0, assign);
	expect(guards).toContain('canOfferWithdraw(');
	expect(guards).not.toContain('flowWallet = undefined');
	expect(guards.match(/\n\t\t\treturn;/g)?.length).toBeGreaterThanOrEqual(4);
});

test('WithdrawModal tracks the withdrawal under the wallet that signed it', () => {
	expect(source).toMatch(
		/async function trackWithdrawal\(id: string, lastValid: number, wallet: string\)/
	);
	expect(source).toContain('await trackWithdrawal(outcome.txId, outcome.lastValid, wallet);');
	expect(source).toContain('void trackWithdrawal(earlier.txId, earlier.lastValid, wallet);');
});

test('WithdrawModal releases the captured wallet only when the flow ends', () => {
	const close = source.slice(source.indexOf('function handleClose()'));
	expect(close.slice(0, close.indexOf('\n\t}\n'))).toContain('flowWallet = undefined;');
	const withdraw = source.slice(source.indexOf('async function handleWithdraw()'));
	const body = withdraw.slice(0, withdraw.indexOf('\n\t}\n'));
	expect(body).toMatch(/status === 'not-recorded'[\s\S]*?flowWallet = undefined;/);
});

test('WithdrawModal never assigns the captured wallet inside a reactive block that reads it', () => {
	const blocks = source.match(/\n\t\$: \{[^]*?\n\t\}\n/g) ?? [];
	for (const block of blocks) {
		if (block.includes('activeWallet')) expect(block).not.toMatch(/\bflowWallet =/);
	}
});

test('withdraw requires the contract owner before building or signing', async () => {
	const handler = source.match(/async function handleWithdraw\([^]*?\n\t\}/)?.[0];
	expect(handler).toBeDefined();
	for (const selected of ['X', 'Z']) {
		const withdraw = vi.fn().mockResolvedValue({ obj: {} });
		const custom = vi.fn().mockResolvedValue({ txns: ['txn'] });
		const CONTRACT = vi.fn(function () {
			return { withdraw, custom, setFee: vi.fn(), setEnableGroupResourceSharing: vi.fn(), setExtraTxns: vi.fn() };
		});
		const signTransactions = vi.fn().mockResolvedValue([[1]]);
		const signAndSendTransactions = vi.fn();
		const sendWithdrawal = vi.fn(async (_request: unknown, deps: { sign: (groups: unknown[][]) => Promise<unknown> }) => {
			await deps.sign([[{}]]);
			return { status: 'confirmed', txId: 'tx' };
		});
		const context = createContext({
			$selectedWallet: { address: selected }, captureSigner: () => ({ address: selected }),
			signerMatchesAccount, wrongSignerMessage,
			contract: { owner: 'Z', contractId: 1 }, canOfferWithdraw: () => true,
			withdrawAmountVOI: 1, availableBalanceVOI: 2, error: null, txStatus: 'idle',
			VOIToMicroVOI: (amount: number) => amount * 1e6,
			CONTRACT, abi: { custom: {} }, algodClient: {}, Buffer,
			algosdk: { decodeUnsignedTransaction: () => ({}) },
			signTransactions, signAndSendTransactions, sendWithdrawal, sendDeps: {}
		});
		runInContext(ts.transpileModule(handler!, {}).outputText, context);
		await runInContext('handleWithdraw()', context);
		if (selected !== 'Z') {
			expect(context.error).toBe(wrongSignerMessage('Z'));
			for (const call of [CONTRACT, withdraw, custom, sendWithdrawal, signTransactions, signAndSendTransactions]) {
				expect(call).not.toHaveBeenCalled();
			}
		} else {
			expect(context.error).toBeNull();
			expect(withdraw).toHaveBeenCalledWith(1000000);
			expect(signTransactions).toHaveBeenCalledWith([[{}]], { address: 'Z' });
			expect(sendWithdrawal).toHaveBeenCalledWith(
				expect.objectContaining({ wallet: 'Z', contractId: 1 }), expect.anything()
			);
			expect(context.txStatus).toBe('confirmed');
		}
	}
});
