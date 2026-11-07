import { expect, test } from 'vitest';
import * as gate from './signerGate';
const signer = { address: 'Y', app: 'pera', walletId: 'pera' };
const watch = { address: 'Y', app: 'Watch', walletId: 'watch' };
test.each([
	['Y', [signer], 'yours'],
	['Y', [watch], 'watch-only'],
	['Y', [], 'read-only'],
	['Y', [{ ...signer, address: 'X' }], 'read-only'],
	['', [signer], 'read-only'],
	['Y', [{ ...signer, app: '' }], 'read-only'],
	['Y', [{ address: 'Y' }], 'read-only']
])('classifies page %s with %j as %s', (page, entries, expected) => {
	expect(gate).toHaveProperty('pageAccountState');
	expect(gate.pageAccountState(page as string, entries as (typeof signer)[]).state).toBe(expected);
});
test.each([
	[watch, signer],
	[signer, watch],
	[signer, { ...signer, walletId: 'defly', app: 'defly' }]
])('uses the first connected signing entry in %j', (...entries) => {
	expect(gate).toHaveProperty('pageAccountState');
	expect(gate.pageAccountState('Y', entries)).toEqual({ state: 'yours', signingEntry: signer });
});
test.each([
	['Y', 'Y', true],
	['X', 'Y', false],
	['y', 'Y', false],
	['', '', false],
	['Y', null, false],
	['Y', undefined, false]
] as const)('signer %s matches %s: %s', (address, page, expected) => {
	expect(gate.signerMatchesAccount({ address }, page)).toBe(expected);
});
test('capture refusal explains that nothing was signed', () => {
	expect(gate.wrongSignerMessage()).toBe(
		"This page's account isn't connected in a signing wallet. Nothing was signed."
	);
});

test('two signing providers follow connected order in either order', () => {
	expect(gate).toHaveProperty('pageAccountState');
	const other = { ...signer, app: 'defly', walletId: 'defly' };
	expect(gate.pageAccountState('Y', [other, signer])).toEqual({
		state: 'yours',
		signingEntry: other
	});
});
