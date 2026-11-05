import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');

test('signing availability reacts to both the selection and the page account', () => {
	expect(source).toMatch(
		/^\t\$: canSignTransactions = canSignFor\(\$selectedWallet, walletAddress\);$/m
	);
});

test('portfolio initialization does not assign signing availability', () => {
	const block = source.match(
		/lastInitializedWallet = walletAddress;[\s\S]*?initializePortfolio\(\);/
	);
	expect(block).not.toBeNull();
	expect(block?.[0]).not.toMatch(/canSignTransactions\s*=/);
});

// The send form is opened for the account the page shows. Its balance is fetched once when it opens,
// so a page that moves to another account (back button, a link) must not keep the form open over
// the new account.
test('a change of page account closes the send form', () => {
	const block = source.match(
		/lastInitializedWallet = walletAddress;[\s\S]*?initializePortfolio\(\);/
	);
	expect(block).not.toBeNull();
	expect(block?.[0]).toMatch(/^\t\t\tshowSendVoiModal = false;$/m);
});
