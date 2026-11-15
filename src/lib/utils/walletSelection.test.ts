import { expect, test } from 'vitest';
import { pickNavigation } from './walletSelection';
test.each([
	['X', 'Y', false, '/wallet/X'],
	['Y', 'Y', false, null],
	['OWNER', 'CONTRACT', false, '/wallet/OWNER'],
	['X', 'Y', true, null],
	['WATCH', 'Y', false, '/wallet/WATCH'],
	['X', undefined, false, '/wallet/X']
] as const)(
	'pick %s from %s with pin %s navigates to %s',
	(address, routeAddress, pinned, expected) => {
		expect(pickNavigation({ pick: { address }, routeAddress, pinned })).toBe(expected);
	}
);
