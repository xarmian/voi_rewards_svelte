import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');
const fetchAccountDetails = source.match(/\tasync function fetchAccountDetails\([^]*?\n\t\}/)?.[0];

test('portfolio applies the account through onAccount', () => {
	expect(fetchAccountDetails).toBeDefined();
	expect(fetchAccountDetails).toMatch(/loadAccountDetails\([^]*?onAccount\s*:/);
});

test('account balance is derived only from the loaded account part', () => {
	expect(source, 'Derive accountBalance reactively from the loaded account').toMatch(
		/\$:\s*accountBalance\s*=\s*accountPart\.status === 'loaded'\s*\?\s*accountPart\.value\.balance\s*:\s*0;/
	);
	expect(
		[...source.matchAll(/\baccountBalance\s*=/g)],
		'Do not retain an imperative balance assignment'
	).toHaveLength(1);
});

test('account part callbacks ignore older load generations', () => {
	expect(source, 'Track the current account load generation').toMatch(/let loadGeneration = 0;/);
	expect(fetchAccountDetails, 'Start a new generation for every account load').toMatch(
		/const generation = \+\+loadGeneration;/
	);
	const callback = fetchAccountDetails?.match(
		/onAccount:\s*\(result\) => \{([^]*?)accountPart = result/
	)?.[1];
	expect(callback, 'Ignore old generations before applying any account part').toMatch(
		/if\s*\([^)]*generation !== loadGeneration[^)]*\)\s*return;/
	);
});

test('the unread loading, totals and Envoi state is gone', () => {
	for (const name of [
		'totalsIncomplete',
		'totalsPending',
		'totalsReady',
		'recomputeTotals',
		'isLoadingPortfolio',
		'isLoadingLPTokens',
		'envoiName',
		'envoiAvatar',
		'getEnvoiNames',
		'createdAtPart',
		'rewardsPart',
		'fetchRewardsHistory',
		'lookupCreatedAt',
		'REWARDS_ADDRESSES'
	]) {
		expect(source, `${name} should be removed`).not.toContain(name);
	}
});
