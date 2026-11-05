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

test('stops the bulk claim on a disconnected wallet or a sender mismatch, with the library message', () => {
	const loop = source.slice(source.indexOf('for (const batch of transactionBatches)'));
	expect(loop).toContain("error.code === 'SIGNER_DISCONNECTED'");
	expect(loop).toContain("error.code === 'SIGNER_TRANSACTION_MISMATCH'");
	const stop = loop.slice(loop.indexOf("error.code === 'SIGNER_DISCONNECTED'"));
	expect(stop.slice(0, stop.indexOf('break;'))).toContain('bulkClaimError = error instanceof Error');
});

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
