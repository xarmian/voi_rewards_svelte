import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');

test('signs every bulk claim batch as the captured signer, whatever the picker does', () => {
	const loop = source.slice(source.indexOf('for (const batch of transactionBatches)'));
	const beforeSign = loop.slice(0, loop.indexOf('await signTransactions('));
	// The old stop-when-the-selection-moved checks are gone: the signer is fixed at confirmation.
	expect(beforeSign).not.toContain('$selectedWallet');
	expect(loop).toContain('await signTransactions([grouped], signer)');
	expect(source).toContain('{bulkClaimError}');
});

test('stops the bulk claim on any signer error, with the library message', () => {
	// SIGNER_DISCONNECTED, SIGNER_WATCH_ONLY, SIGNER_TRANSACTION_MISMATCH and SIGNER_RESULT_MISMATCH
	// will not clear on the next batch, and each retry would prompt the user again.
	const loop = source.slice(source.indexOf('for (const batch of transactionBatches)'));
	const match = loop.indexOf("error.code.startsWith('SIGNER_')");
	expect(match).toBeGreaterThan(-1);
	expect(loop).toContain("typeof error.code === 'string'");
	expect(loop.slice(match, loop.indexOf('break;', match))).toContain(
		'bulkClaimError = error instanceof Error'
	);
});

test.each(['PortfolioComponent', 'OptOutModal'])(
	'%s shows a refused signer capture in its error area instead of throwing from the handler',
	(component) => {
		const text = readFileSync(new URL(`./${component}.svelte`, import.meta.url), 'utf8');
		// The stores can lag the rune store by a tick, so a guard can pass and the capture still refuse.
		const capture = text.indexOf('signer = captureSigner();');
		expect(capture).toBeGreaterThan(-1);
		expect(text.slice(capture - 40, capture)).toMatch(/try \{\s*$/);
		const catchBody = text.slice(capture, text.indexOf('return;', capture));
		expect(catchBody).toMatch(/(optOutError|bulkClaimError) = captureError instanceof Error/);
	}
);

test.each(['FungibleToken', 'ClaimableTokenCard', 'RegisterVoteKey', 'OptOutModal'])(
	'%s has no live selection reads after its signing call',
	(component) => {
		const text = readFileSync(new URL(`./${component}.svelte`, import.meta.url), 'utf8');
		const functions = [...text.matchAll(/\tasync function \w+\([^]*?\n\t\}/g)].map(
			(match) => match[0]
		);
		const signing = functions.filter((body) =>
			/(?:signTransactions|signAndSendTransactions|sendWalletKeyreg)\(/.test(body)
		);
		expect(signing.length).toBeGreaterThan(0);
		for (const body of signing) {
			const index = body.search(/(?:signTransactions|signAndSendTransactions|sendWalletKeyreg)\(/);
			expect(body.slice(index)).not.toContain('$selectedWallet');
		}
	}
);

test('bulk claim captures its signer before any await and refuses another selection', () => {
	const start = source.indexOf('async function bulkClaimAllTokens()');
	const fn = source.slice(start, source.indexOf('\n\t}\n', start));
	const capture = fn.indexOf('captureSigner()');
	expect(capture).toBeGreaterThan(0);
	expect(capture).toBeLessThan(fn.indexOf('await '));
	// The account on screen must be the one that is selected, in a wallet that can sign.
	const guard = fn.slice(0, capture);
	expect(guard).toContain('selected?.address !== walletAddress');
	expect(guard).toContain("selected.app === 'Watch'");
	expect(fn).toMatch(/const claimAccount = signer\.address;/);
});

test('bulk claim refuses a signer that is not the account the page claims for, before building', () => {
	// The readable store can lag the rune store by a tick, so the guard can pass for account A while
	// captureSigner returns B. The claims are built for A's approvals from claimAccount: a signer that
	// is not A must stop the run before any transaction is built, or the sender would follow the
	// signer instead of the account the user confirmed.
	const start = source.indexOf('async function bulkClaimAllTokens()');
	const fn = source.slice(start, source.indexOf('\n\t}\n', start));
	const capture = fn.indexOf('captureSigner()');
	// The whole statement, so a neutralised condition (`false && …`) does not satisfy it.
	const statement = /\n\t\tif \(signer\.address !== walletAddress\) \{\n/.exec(fn);
	expect(statement).not.toBeNull();
	const check = statement?.index ?? -1;
	const marker = fn.indexOf('const claimAccount = signer.address;');
	expect(check).toBeGreaterThan(capture);
	expect(marker).toBeGreaterThan(check);
	expect(check).toBeLessThan(fn.indexOf('await '));
	const refusal = fn.slice(check, fn.indexOf('return;', check));
	expect(refusal).toContain('bulkClaimError = `Select account ${walletAddress}');
});

test('bulk claim builds its transactions from the captured account, not the live route address', () => {
	const start = source.indexOf('async function bulkClaimAllTokens()');
	const fn = source.slice(start, source.indexOf('\n\t}\n', start));
	const marker = 'const claimAccount = signer.address;';
	expect(fn).toContain(marker);
	const afterCapture = fn.slice(fn.indexOf(marker) + marker.length);
	expect(afterCapture).not.toMatch(/\bwalletAddress\b/);
});

test('each bulk claim result names the account that signed it', () => {
	const start = source.indexOf('async function bulkClaimAllTokens()');
	const fn = source.slice(start, source.indexOf('\n\t}\n', start));
	expect(fn.match(/wallet: claimAccount/g)).toHaveLength(2);
});
