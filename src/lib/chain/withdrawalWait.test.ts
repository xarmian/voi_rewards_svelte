import { expect, test } from 'vitest';
import { minutesUntilExpiry } from './withdrawalWait';

test.each([
	[NaN, 1],
	[Infinity, 1],
	[-Infinity, 1],
	[1, NaN],
	[1, Infinity],
	[1, -Infinity],
	[100, 101]
])('returns null for unusable or passed rounds (%s, %s)', (lastValid, round) => {
	expect(minutesUntilExpiry(lastValid, round)).toBeNull();
});

test('rounds up with a minimum of one minute, including the last valid round', () => {
	expect(minutesUntilExpiry(100, 100)).toBe(1);
	expect(minutesUntilExpiry(100, 0)).toBe(6);
	expect(minutesUntilExpiry(100, 99)).toBe(1);
	expect(minutesUntilExpiry(100, 0, 1)).toBe(2);
	expect(minutesUntilExpiry(100, 0, 0)).toBe(1);
});
