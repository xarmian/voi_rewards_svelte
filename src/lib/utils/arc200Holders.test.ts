import algosdk from 'algosdk';
import { describe, expect, it } from 'vitest';
import { decimalToBaseUnits, sumBaseUnits } from '$lib/chain/baseUnits';
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
		'preserves recipients with exact proportional amounts for %s at minimum %s',
		(distribution, minimum) => {
			const holders = filterHolders(balances, contractId, Number(minimum));
			const recipients = buildHolderRecipients(holders, distribution, baseline.amountValue);
			const expected = baseline.recipients[distribution][minimum as '0' | '1.5'];
			// Preserve the historical fixture, but replace its float-based proportional amounts.
			const proportionalAmounts =
				minimum === '0' ? ['4', '16', '80', '', ''] : ['16.66666666', '83.33333333'];
			expect(recipients).toEqual(
				distribution === 'proportional'
					? expected.map((recipient, index) => ({
							...recipient,
							amount: proportionalAmounts[index]
						}))
					: expected
			);
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

describe('ARC-200 proportional holder amounts', () => {
	it.each([
		{
			name: 'floors thirds without exceeding the pool',
			pool: '2',
			balances: ['5', '5', '5'],
			expected: ['0.66666666', '0.66666666', '0.66666666']
		},
		{
			name: 'splits unequal balances proportionally',
			pool: '1',
			balances: ['1', '3'],
			expected: ['0.25', '0.75']
		},
		{
			name: 'handles balances above the safe integer limit exactly',
			pool: '1',
			balances: ['9007199254740993', '9007199254740993'],
			expected: ['0.5', '0.5']
		},
		{
			name: 'leaves amounts blank when the total balance is zero',
			pool: '1',
			balances: ['0', '0'],
			expected: ['', '']
		},
		{
			name: 'leaves a floored zero share blank',
			pool: '0.00000002',
			balances: ['1', '3'],
			expected: ['', '0.00000001']
		}
	])('$name', ({ pool, balances, expected }) => {
		const holders = balances.map((balance, index) => ({
			accountId: `holder-${index}`,
			balance,
			decimals: 6
		}));
		const amounts = buildHolderRecipients(holders, 'proportional', pool).map((row) => row.amount);
		expect.soft(amounts).toEqual(expected);
		expect(sumBaseUnits(amounts, 8)).toBeLessThanOrEqual(decimalToBaseUnits(pool, 8));
	});

	it.each(['', 'invalid', '1e3', '-1'])('leaves amounts blank for invalid pool %j', (pool) => {
		const holders = [{ accountId: 'holder', balance: '1', decimals: 6 }];
		expect(buildHolderRecipients(holders, 'proportional', pool).map((row) => row.amount)).toEqual([
			''
		]);
	});
});
