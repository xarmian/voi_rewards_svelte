import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');
const transfers = readFileSync(new URL('./TokenTransfersModal.svelte', import.meta.url), 'utf8');

function loadedAccountBranches() {
	return [
		...source.matchAll(
			/\{#if [^}]*accountPart\.status === 'loaded'[^}]*\}([\s\S]*?)(?=\{:else|\{\/if\})/g
		)
	]
		.map((match) => match[1])
		.join('\n');
}

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

test('balance rendering requires a loaded account and offers retry on failure', () => {
	expect(source, 'An unavailable balance must be labelled explicitly').toContain(
		'Balance unavailable'
	);
	expect(source, 'A failed lookup must offer Retry').toMatch(
		/on:click=\{retryAccountDetails\}[^>]*>\s*Retry\s*</
	);
	const balanceLine = '{(accountBalance / 1e6).toLocaleString()} VOI';
	expect(
		loadedAccountBranches(),
		'Only a loaded algod account may render the VOI balance'
	).toContain(balanceLine);
	expect(
		source.split(balanceLine).length - 1,
		'Do not leave a second, unguarded balance line'
	).toBe(1);
});

test('ConsensusDetails requires a loaded account part', () => {
	expect(
		loadedAccountBranches(),
		'ConsensusDetails must only receive a loaded algod snapshot'
	).toContain('<ConsensusDetails');
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
