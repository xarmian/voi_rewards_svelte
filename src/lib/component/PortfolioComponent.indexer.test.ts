import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');
const transfers = readFileSync(new URL('./TokenTransfersModal.svelte', import.meta.url), 'utf8');

const presenter = readFileSync(
	new URL('../ds/WalletHoldings/WalletHoldings.svelte', import.meta.url),
	'utf8'
);
const display = readFileSync(new URL('../wallet/holdings.ts', import.meta.url), 'utf8');

test('account balance and status no longer come from the indexer', () => {
	for (const field of ['amount', 'status']) {
		expect(source, `Read ${field} from the algod snapshot, never accountIndexerInfo`).not.toContain(
			`accountIndexerInfo.account.${field}`
		);
	}
});

test('PortfolioComponent imports and calls the independent account loader', () => {
	expect(source, 'Import loadAccountDetails from the pure portfolio module').toMatch(
		/import\s*\{[^}]*\bloadAccountDetails\b[^}]*\}\s*from ['"]\$lib\/portfolio\/accountDetails['"]/
	);
	expect(source, 'Call loadAccountDetails when fetching account details').toMatch(
		/await loadAccountDetails\(/
	);
});

test('balance rendering delegates the raw account state and its real retry to the presenter', () => {
	expect(source).toContain('account={accountPart}');
	expect(source).toContain('onretryAccount={retryAccountDetails}');
	expect(presenter).toContain("account.status === 'unavailable'");
	expect(presenter).toContain('VOI balance unavailable');
	expect(presenter).toContain('onretry={onretryAccount}');
	expect(display).toMatch(/account.status === 'loaded' \? account.value.balance \/ 1e6 : null/);
});

test('Holdings no longer mounts the legacy consensus summary; the route retains its Overview disclosure', () => {
	expect(source).not.toMatch(/<ConsensusDetails\b/);
	const route = readFileSync(
		new URL('../../routes/(site)/wallet/[...id]/+page.svelte', import.meta.url),
		'utf8'
	);
	expect(route).toContain('Consensus details');
});

test('the transfers modal labels an unavailable balance without reading token.balance', () => {
	expect(transfers, 'The transfers modal needs an optional balanceUnavailable prop').toMatch(
		/export let balanceUnavailable = false;/
	);
	const branch = transfers.match(/\{#if balanceUnavailable\}([\s\S]*?)\{:else\}/)?.[1];
	expect(branch, 'The unavailable modal branch must display Balance unavailable').toContain(
		'Balance unavailable'
	);
	expect(
		branch,
		'The unavailable modal branch must not use the stale or default balance'
	).not.toContain('token.balance');
	expect(source, 'Pass the account load state to TokenTransfersModal').toMatch(
		/this=\{TokenTransfersModal\}[\s\S]*?balanceUnavailable=\{accountPart\.status !== 'loaded'\}/
	);
});

test('rewards history failures are not converted to an empty history', () => {
	const history = source.match(
		/async function fetchRewardsHistory\([^]*?(?=\n\tasync function)/
	)?.[0];
	expect(history, 'Keep an explicit rewards transaction lookup').toBeDefined();
	expect(history, 'Let the loader settle history failures as unavailable, never []').not.toMatch(
		/return\s*\[\s*\]/
	);
});
