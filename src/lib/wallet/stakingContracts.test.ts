import { expect, it } from 'vitest';
import { buildStakingContractMap } from './stakingContracts';

it('deduplicates loaded contracts by address and converts IDs without precision loss', () => {
	expect([
		...buildStakingContractMap([
			{ address: 'A', contractId: 12 },
			{ address: 'B', contractId: '009007199254740993' },
			{ address: 'C', contractId: 9007199254740995n },
			{ address: 'A', contractId: '12' }
		])
	]).toEqual([
		['A', '12'],
		['B', '9007199254740993'],
		['C', '9007199254740995']
	]);
});
it('returns an empty map while the loaded contract set is unavailable', () => {
	expect([...buildStakingContractMap([{ address: 'A', contractId: 12 }], false)]).toEqual([]);
});
it.each([
	1.5,
	NaN,
	Infinity,
	Number.MAX_SAFE_INTEGER + 1,
	-1,
	-1n,
	'1.5',
	'1e3',
	'=12',
	'+12',
	'-12',
	'',
	' 12'
])('rejects an inexact or non-decimal contract ID %s', (contractId) => {
	expect([
		...buildStakingContractMap([
			{ address: 'INVALID', contractId },
			{ address: 'VALID', contractId: 12 }
		])
	]).toEqual([['VALID', '12']]);
});
