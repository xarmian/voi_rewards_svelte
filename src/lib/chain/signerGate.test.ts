import { expect, test } from 'vitest';
import { canSignFor, signerMatchesAccount, wrongSignerMessage } from './signerGate';

test.each([
	[{ address: 'Y', app: 'Pera' }, 'Y', true],
	[{ address: 'X', app: 'Pera' }, 'Y', false],
	[{ address: 'Y', app: 'Watch' }, 'Y', false],
	[{ address: 'Y', app: '' }, 'Y', false],
	[{ address: 'Y' }, 'Y', true],
	[null, 'Y', false],
	[undefined, 'Y', false],
	[{ address: '' }, '', false],
	[{ address: 'Y' }, null, false],
	[{}, undefined, false]
] as const)('canSignFor(%j, %j) is %j', (selected, account, expected) => {
	expect(canSignFor(selected, account)).toBe(expected);
});

test.each([
	['Y', 'Y', true],
	['X', 'Y', false],
	['y', 'Y', false],
	['', '', false],
	['Y', null, false],
	['Y', undefined, false]
] as const)('signer %j matches account %j: %j', (address, account, expected) => {
	expect(signerMatchesAccount({ address }, account)).toBe(expected);
});

test.each(['Y', '', null, undefined])('refusal names account %j when provided', (account) => {
	expect(wrongSignerMessage(account)).toBe(
		account
			? `Select account ${account} in a signing wallet to continue.`
			: 'Select the account this page shows in a signing wallet to continue.'
	);
});
