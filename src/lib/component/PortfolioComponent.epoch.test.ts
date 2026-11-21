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
		'getTokensByEpoch',
		'rewardSenders'
	])
		expect(source, `${dead} should be removed`).not.toContain(dead);
});
