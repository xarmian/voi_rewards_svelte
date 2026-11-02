import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');
const fetchAccountDetails = source.match(/\tasync function fetchAccountDetails\([^]*?\n\t\}/)?.[0];

test('portfolio applies account details through onPart', () => {
	expect(fetchAccountDetails).toBeDefined();
	expect(fetchAccountDetails).toMatch(/loadAccountDetails\([^]*?onPart\s*:/);
});

test('portfolio totals are incomplete only when the account is unavailable', () => {
	const line = source.split('\n').find((line) => line.includes('$: totalsIncomplete'));
	expect(line).toContain("accountPart.status === 'unavailable'");
	expect(line).not.toContain("!== 'loaded'");
});

test('Envoi and epoch work starts before awaiting the account lookups', () => {
	expect(fetchAccountDetails).toBeDefined();
	const epochStart = fetchAccountDetails!.indexOf('getEnvoiNames(');
	const awaitingAccount = fetchAccountDetails!.indexOf('await loadAccountDetails(');
	expect(epochStart).toBeGreaterThan(-1);
	expect(awaitingAccount === -1 || awaitingAccount > epochStart).toBe(true);
});
