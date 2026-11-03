import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./WithdrawModal.svelte', import.meta.url), 'utf8');

test('withdraw signs separately and uses the recorded send flow and wait estimate', () => {
	expect(source, 'The wallet combined helper cannot distinguish ambiguous sends').not.toContain(
		'signAndSendTransactions'
	);
	for (const name of ['sendWithdrawal', 'minutesUntilExpiry'])
		expect(source, `${name} must be imported and used`).toMatch(new RegExp(`\\b${name}\\(`));
	expect(source, 'Signing must be delegated to signTransactions').toMatch(
		/sign:\s*signTransactions/
	);
	expect(source, 'A missing wallet must be rejected before building').toMatch(
		/Connect a wallet to withdraw[\s\S]*new CONTRACT\(/
	);
});

test('all modal registry calls are scoped to the wallet as well as contract', () => {
	const calls = source.match(/(?:get|clear|remember)PendingWithdrawal\([^)]*\)/g) ?? [];
	expect(calls.length, 'The modal must read and clear persisted records').toBeGreaterThanOrEqual(3);
	for (const call of calls)
		expect(call, 'Every registry call must start with a wallet address').toMatch(
			/PendingWithdrawal\((?:wallet|\$selectedWallet\?\.address),\s*(?:contractId|contract\.contractId)/
		);
});

test('tracking lives until close or destroy and has no ten second cutoff', () => {
	expect(source, 'Tracking needs an owned abort controller').toMatch(
		/let trackController:\s*AbortController/
	);
	const close = source.match(/function handleClose\([\s\S]*?\n\t\}/)?.[0];
	const destroy = source.match(/onDestroy\(\(\) => \{[\s\S]*?\n\t\}\)/)?.[0];
	for (const [name, body] of [
		['handleClose', close],
		['onDestroy', destroy]
	])
		expect(body, `${name} must abort tracking`).toMatch(/trackController\?\.abort\(\)/);
	expect(source, 'Tracking must have no fixed expiry timeout').not.toMatch(
		/AbortSignal\.timeout\(10000\)/
	);
	expect(source, 'trackPending must use the controller signal').toMatch(
		/trackPending\([\s\S]*?\{ signal \}/
	);
	expect(destroy, 'Destroy must stop the wait estimate timer').toMatch(/clearInterval\(/);
	expect(source, 'Wait estimates refresh every thirty seconds').toMatch(
		/setInterval\([\s\S]*?30_?000\)/
	);
	expect(source, 'Round reads must use the shared tracking dependencies').toMatch(
		/trackingDeps\.algodRound\(\)/
	);
});

test('the in-progress view explains confirmation and expiry without offering another withdrawal', () => {
	for (const text of [
		'A withdrawal is in progress',
		'Waiting for it to be confirmed on the network.',
		'Waiting for an earlier withdrawal to expire',
		'The earlier withdrawal expired without going through. You can withdraw again.'
	])
		expect(source, `Missing withdrawal message: ${text}`).toContain(text);
	const branch = source.match(
		/\{:else if txStatus === 'pending'(?: \|\| txStatus === 'confirming')?\}([\s\S]*?)(?=\{:else if txStatus)/
	)?.[1];
	expect(branch, 'Pending and confirming need an in-progress view').toBeDefined();
	expect(branch, 'The in-progress view must not render a form').not.toMatch(
		/<input|on:click=\{handleWithdraw\}/
	);
});

test('the amount input and Withdraw button use the synchronous registry guard', () => {
	expect(source, 'Availability must be derived from canOfferWithdraw and recordTick').toMatch(
		/\$:\s*\{\s*void recordTick;\s*\w+\s*=\s*canOfferWithdraw\(/
	);
	const guard = source.match(/(\w+)\s*=\s*canOfferWithdraw\(/)?.[1];
	expect(guard, 'A synchronous guard must exist').toBeDefined();
	const input = source.match(/<input\b[^>]*id="amount"[^>]*\/>/)?.[0];
	const button = source.match(/<button\b[^>]*on:click=\{handleWithdraw\}[^>]*>/)?.[0];
	for (const [name, element] of [
		['amount input', input],
		['Withdraw button', button]
	])
		expect(element, `${name} must be disabled when the registry guard is false`).toMatch(
			new RegExp(`disabled=\\{[^}]*!${guard}`)
		);
	expect(source, 'The form must be hidden when a withdrawal cannot be offered').toContain(
		`{#if ${guard}}`
	);
});

test('cross-tab storage events invalidate the guard and resume tracking', () => {
	const mount = source.match(/onMount\(\(\) => \{[\s\S]*?\n\t\}\)/)?.[0];
	const destroy = source.match(/onDestroy\(\(\) => \{[\s\S]*?\n\t\}\)/)?.[0];
	expect(mount, 'Listen for other tabs when mounted').toMatch(
		/addEventListener\('storage',\s*handleStorage\)/
	);
	expect(destroy, 'Remove the storage listener when destroyed').toMatch(
		/removeEventListener\('storage',\s*handleStorage\)/
	);
	expect(source, 'Storage updates must match this wallet key').toMatch(
		/event\.key === pendingWithdrawalStorageKey\(wallet,\s*contract\.contractId\)/
	);
	expect(source, 'Storage updates must invalidate availability').toMatch(
		/function handleStorage[\s\S]*?recordTick\+\+/
	);
	expect(source, 'Resume must react to cross-tab record changes').toMatch(
		/\$:\s*\{\s*void recordTick;[\s\S]*?show && txStatus === 'idle'[\s\S]*?getPendingWithdrawal\(/
	);
});

test('a failure to record is displayed as an error without a modal broadcast path', () => {
	expect(source, 'The not-recorded outcome must be handled explicitly').toMatch(
		/(?:result|outcome)\.status === 'not-recorded'[\s\S]*?txStatus = 'error'/
	);
	expect(source, 'Only the pure send flow may broadcast').not.toMatch(
		/await\s+(?:algodClient\.sendRawTransaction|sendAndConfirm)\(/
	);
});

test('the wait explanation includes a window that ended without history proof', () => {
	expect(source).toContain(
		"This withdrawal's valid window has ended, but the history service has not yet confirmed whether it landed. We keep checking, and you can withdraw again as soon as that is known."
	);
	expect(source).toMatch(/explainWait\(/);
	expect(source).toContain("'window-ended'");
});

test('tracking failures retry the entire pass after an abortable fifteen second pause', () => {
	const tracking = source.match(/async function trackWithdrawal[\s\S]*?\n\t\}/)?.[0] ?? '';
	expect(tracking).toMatch(/while\s*\(!signal\.aborted\)/);
	expect(tracking).toMatch(/catch\s*\{[\s\S]*?await pause\(15_?000\)/);
	expect(tracking).toMatch(/signal\.addEventListener\('abort', finish/);
	expect(tracking).toMatch(/signal\.removeEventListener\('abort', finish/);
});

test('every tracking resolution sets the view before clearing the record', () => {
	const tracking = source.match(/async function trackWithdrawal[\s\S]*?\n\t\}/)?.[0] ?? '';
	for (const [name, status] of [
		['outcome', 'confirmed'],
		['tracked', 'confirmed'],
		['tracked', 'expired']
	]) {
		const branch =
			tracking.match(new RegExp(String.raw`${name}\.status === '${status}'\) \{([^}]+)`))?.[1] ??
			'';
		expect(branch).toContain(`txStatus = '${status === 'expired' ? 'error' : 'confirmed'}'`);
		expect(branch.indexOf('txStatus =')).toBeLessThan(branch.indexOf('clearPendingWithdrawal('));
	}
});

test('a failed round lookup keeps the last known round instead of forgetting it', () => {
	const source = readFileSync(new URL('./WithdrawModal.svelte', import.meta.url), 'utf8');
	expect(
		source,
		'Resetting the round to NaN on a lookup error would flip the explanation text back and forth'
	).not.toMatch(/currentRound\s*=\s*NaN/);
});
