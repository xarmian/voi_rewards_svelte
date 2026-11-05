import algosdk from 'algosdk';
import { describe, expect, it } from 'vitest';
import baseline from './arc200Holders.baseline.json';
import {
	buildHolderRecipients,
	countValidHolders,
	filterHolders,
	zeroAddress,
	type HolderDistributionType
} from './arc200Holders';

// The baseline file holds the holder lists and counts the app produced under algosdk 2 for this
// balance set. Nothing here stubs an address: the contract account comes from the real
// getApplicationAddress, so a comparison that mixes an Address object with a string goes red.
const contractId = String(baseline.appId);
const balances = baseline.balances;

describe('ARC-200 holder filtering matches the algosdk 2 baseline', () => {
	it('puts the contract account in the fixture as the real application address', () => {
		const address = algosdk.getApplicationAddress(Number(contractId));
		expect(balances.some((balance) => balance.accountId === address.toString())).toBe(true);
		expect(balances.some((balance) => balance.accountId === zeroAddress)).toBe(true);
	});

	it.each(Object.keys(baseline.filtered))('lists the same holders at minimum %s', (minimum) => {
		const key = minimum as keyof typeof baseline.filtered;
		const result = filterHolders(balances, contractId, Number(minimum));
		expect(result.map((balance) => balance.accountId)).toEqual(baseline.filtered[key]);
		expect(result).toHaveLength(baseline.qualifiedCount[key]);
	});

	it('counts the same valid holders with no minimum', () => {
		expect(countValidHolders(balances, contractId)).toBe(baseline.validHolderCount);
	});

	// Who is paid and how much: the step between the holder list and the transactions that are sent.
	const distributions = Object.keys(baseline.recipients) as HolderDistributionType[];
	it.each(distributions.flatMap((d) => Object.keys(baseline.filtered).map((m) => [d, m] as const)))(
		'builds the same recipients and amounts for %s at minimum %s',
		(distribution, minimum) => {
			const holders = filterHolders(balances, contractId, Number(minimum));
			const recipients = buildHolderRecipients(holders, distribution, baseline.amountValue);
			expect(recipients).toEqual(baseline.recipients[distribution][minimum as '0' | '1.5']);
		}
	);

	it('never lists the contract account or the zero address', () => {
		const excluded = new Set([
			zeroAddress,
			algosdk.getApplicationAddress(Number(contractId)).toString()
		]);
		for (const minimum of [0, 1.5]) {
			const result = filterHolders(balances, contractId, minimum);
			expect(result.some((balance) => excluded.has(balance.accountId))).toBe(false);
		}
	});
});
