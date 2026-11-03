import algosdk from 'algosdk';
import { expect, test } from 'vitest';
import {
	editDestination,
	emptyDestination,
	pickedName,
	selectDestinationName
} from './destinationSelection';

const rules = { kind: 'nfd' as const, isValidAddress: algosdk.isValidAddress };
const address = algosdk.generateAccount().addr.toString();

test('a picked name is a picked name', () => {
	const state = selectDestinationName(emptyDestination, { name: 'chosen.algo', address }, rules);
	expect(pickedName(state)).toBe(true);
});

test('a typed address labelled with a reverse-resolved name is not a picked name', () => {
	const typed = editDestination(emptyDestination, address, rules);
	expect(pickedName(typed)).toBe(false);
	expect(pickedName({ ...typed, name: 'label.algo' })).toBe(false);
});

test('a name that did not resolve, or was edited after the pick, is not a picked name', () => {
	const picked = selectDestinationName(emptyDestination, { name: 'chosen.algo', address }, rules);
	expect(
		pickedName(selectDestinationName(emptyDestination, { name: 'x.algo', address: '' }, rules))
	).toBe(false);
	expect(pickedName(editDestination(picked, 'chosen.alg', rules))).toBe(false);
});
