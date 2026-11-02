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

test('account balance is derived only from the loaded account part', () => {
	expect(source, 'Derive accountBalance reactively from the loaded account').toMatch(
		/\$:\s*accountBalance\s*=\s*accountPart\.status === 'loaded'\s*\?\s*accountPart\.value\.balance\s*:\s*0;/
	);
	expect(
		[...source.matchAll(/\baccountBalance\s*=/g)],
		'Do not retain an imperative balance assignment'
	).toHaveLength(1);
});

test('portfolio totals remain pending while the account loads', () => {
	const pending = source.match(/\$:\s*totalsPending\s*=([^]*?);/)?.[1];
	expect(pending, 'Loading account details must keep totals pending').toContain(
		"accountPart.status === 'loading'"
	);
});

test('account part callbacks ignore older load generations', () => {
	expect(source, 'Track the current account load generation').toMatch(/let loadGeneration = 0;/);
	expect(fetchAccountDetails, 'Start a new generation for every account load').toMatch(
		/const generation = \+\+loadGeneration;/
	);
	const callback = fetchAccountDetails?.match(
		/onPart:\s*\(part, result\) => \{([^]*?)if \(part/
	)?.[1];
	expect(callback, 'Ignore old generations before applying any account part').toMatch(
		/if\s*\([^)]*generation !== loadGeneration[^)]*\)\s*return;/
	);
});

test('Envoi and epoch work starts before awaiting the account lookups', () => {
	expect(fetchAccountDetails).toBeDefined();
	const epochStart = fetchAccountDetails!.indexOf('getEnvoiNames(');
	const awaitingAccount = fetchAccountDetails!.indexOf('await loadAccountDetails(');
	expect(epochStart).toBeGreaterThan(-1);
	expect(awaitingAccount === -1 || awaitingAccount > epochStart).toBe(true);
});
