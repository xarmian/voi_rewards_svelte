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
