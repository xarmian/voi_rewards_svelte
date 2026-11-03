import { expect, test } from 'vitest';
import algosdk from 'algosdk';
import { nfdReceiveAddress } from './nfd';

const owner = algosdk.generateAccount().addr.toString();
const deposit = algosdk.generateAccount().addr.toString();

test('an NFD whose depositAccount differs from its owner receives at the depositAccount', () => {
	expect(nfdReceiveAddress({ owner, depositAccount: deposit })).toBe(deposit);
});

test('an empty depositAccount falls back to the owner', () => {
	expect(nfdReceiveAddress({ owner, depositAccount: '' })).toBe(owner);
	expect(nfdReceiveAddress({ owner })).toBe(owner);
});

test('an invalid depositAccount falls back to the owner', () => {
	expect(nfdReceiveAddress({ owner, depositAccount: 'not-an-address' })).toBe(owner);
	expect(nfdReceiveAddress({ owner, depositAccount: deposit.slice(1) })).toBe(owner);
});

test('a result with no valid address resolves to nothing', () => {
	expect(nfdReceiveAddress({ owner: 'x', depositAccount: 'y' })).toBeNull();
	expect(nfdReceiveAddress({ owner: '', depositAccount: '' })).toBeNull();
	expect(nfdReceiveAddress({})).toBeNull();
});
