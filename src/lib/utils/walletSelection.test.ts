import { describe, expect, test } from 'vitest';
import { pickNavigation, selectionFromRoute } from './walletSelection';

const A = { address: 'AAAA', app: 'WalletConnect' };
const B = { address: 'BBBB', app: 'WalletConnect' };
const WATCH = { address: 'WWWW', app: 'Watch' };
const connected = [A, B, WATCH];

describe('pickNavigation (a selection the user made in the picker)', () => {
	test('a pick of another account navigates to it', () => {
		expect(pickNavigation({ pick: B, routeAddress: 'AAAA', pinned: false })).toBe('/wallet/BBBB');
	});

	test('a pick while a captured-account flow is open never navigates', () => {
		expect(pickNavigation({ pick: B, routeAddress: 'AAAA', pinned: true })).toBeNull();
	});

	test('a pick of the account already shown does not navigate (connect then authenticate)', () => {
		expect(pickNavigation({ pick: A, routeAddress: 'AAAA', pinned: false })).toBeNull();
	});

	test('a pick of the parent account of the contract being viewed does not navigate', () => {
		expect(
			pickNavigation({
				pick: A,
				routeAddress: 'CHILDCONTRACT',
				parentAddress: 'AAAA',
				pinned: false
			})
		).toBeNull();
	});

	test('a pick of another account still navigates when a parent is set', () => {
		expect(
			pickNavigation({
				pick: B,
				routeAddress: 'CHILDCONTRACT',
				parentAddress: 'AAAA',
				pinned: false
			})
		).toBe('/wallet/BBBB');
	});

	test('a pick with no route yet navigates to the picked account', () => {
		expect(pickNavigation({ pick: A, routeAddress: undefined, pinned: false })).toBe(
			'/wallet/AAAA'
		);
	});
});

describe('selectionFromRoute (a route load or a dropdown pick)', () => {
	test('a connected route address becomes the selection', () => {
		expect(
			selectionFromRoute({ routeAddress: 'BBBB', connected, selected: A, pinned: false })
		).toEqual(B);
	});

	test('a watch account the user added counts as connected', () => {
		expect(
			selectionFromRoute({ routeAddress: 'WWWW', connected, selected: A, pinned: false })
		).toEqual(WATCH);
	});

	test('a page load of a non-connected address leaves the selection alone', () => {
		expect(
			selectionFromRoute({ routeAddress: 'SOMEONE', connected, selected: A, pinned: false })
		).toBeNull();
	});

	test('a dropdown pick of a staking contract (not connected) leaves the selection alone', () => {
		expect(
			selectionFromRoute({ routeAddress: 'STAKINGCONTRACT', connected, selected: B, pinned: false })
		).toBeNull();
	});

	test('nothing is written when the route address is already selected', () => {
		expect(
			selectionFromRoute({ routeAddress: 'AAAA', connected, selected: A, pinned: false })
		).toBeNull();
	});

	test('a selection with no app is upgraded to the connected entry for the same address', () => {
		expect(
			selectionFromRoute({
				routeAddress: 'AAAA',
				connected,
				selected: { address: 'AAAA', app: '' },
				pinned: false
			})
		).toEqual(A);
	});

	test('a selection with no app stays when the address is not connected', () => {
		expect(
			selectionFromRoute({
				routeAddress: 'SOMEONE',
				connected,
				selected: { address: 'SOMEONE', app: '' },
				pinned: false
			})
		).toBeNull();
	});

	test('nothing is written while a captured-account flow is open', () => {
		expect(
			selectionFromRoute({ routeAddress: 'BBBB', connected, selected: A, pinned: true })
		).toBeNull();
	});

	test('an empty route address writes nothing', () => {
		expect(
			selectionFromRoute({ routeAddress: '', connected, selected: A, pinned: false })
		).toBeNull();
	});
});
