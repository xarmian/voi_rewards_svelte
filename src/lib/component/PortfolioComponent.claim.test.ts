import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');

test('stops before signing the next bulk claim batch when its account is no longer selected', () => {
	const loop = source.slice(source.indexOf('for (const batch of transactionBatches)'));
	const beforeSign = loop.slice(0, loop.indexOf('await signTransactions('));
	expect(beforeSign).toMatch(/if \(\$selectedWallet\?\.address !== claimAccount\)/);
	expect(beforeSign).toContain('break;');
	expect(beforeSign).toContain(
		'Your selected account changed during the claim, so it stopped before the next batch. Select'
	);
	expect(beforeSign).toContain('${claimAccount} to continue.');
	expect(source).toContain('{bulkClaimError}');
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

test('bulk claim pins the account at start and rechecks it after signing, before submitting', () => {
	const start = source.indexOf('async function bulkClaimAllTokens()');
	const fn = source.slice(start, source.indexOf('\n\t}\n', start));
	expect(fn).toMatch(/const claimAccount = walletAddress;/);
	const loop = fn.slice(fn.indexOf('for (const batch of transactionBatches)'));
	expect(loop).not.toMatch(/\$selectedWallet\?\.address === walletAddress/);
	const signAt = loop.indexOf('await signTransactions(');
	const sendAt = loop.indexOf('sendRawTransaction(');
	const between = loop.slice(signAt, sendAt);
	expect(between).toMatch(/\$selectedWallet\?\.address !== claimAccount/);
	expect(between).toContain('break;');
});
