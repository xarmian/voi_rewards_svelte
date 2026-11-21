import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');

test('the unread epoch reward estimate and its fetches are gone', () => {
	for (const dead of [
		'currentEpochRewards',
		'epochPart',
		'epochData',
		'epoch-summary',
		'calculateEpochRewards(',
		'dataTable',
		'getTokensByEpoch'
	])
		expect(source, `${dead} should be removed`).not.toContain(dead);
	expect(source, 'Import only REWARDS_ADDRESSES from the rewards module').toContain(
		"import { REWARDS_ADDRESSES } from '$lib/chain/rewardSenders';"
	);
});

test('the Envoi lookup still runs alongside the account load and is awaited', () => {
	const fetchAccountDetails = source.match(
		/async function fetchAccountDetails[\s\S]*?\n\t\}\n/
	)?.[0];
	expect(fetchAccountDetails).toMatch(/const envoiLoading = \(async \(\) => \{/);
	expect(fetchAccountDetails).toContain('getEnvoiNames([requestedWallet])');
	expect(fetchAccountDetails).toMatch(/await envoiLoading;/);
	expect(fetchAccountDetails!.indexOf('getEnvoiNames(')).toBeLessThan(
		fetchAccountDetails!.indexOf('await loadAccountDetails(')
	);
});
