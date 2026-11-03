import { expect, test } from 'vitest';
import { explainWait, minutesUntilExpiry } from './withdrawalWait';

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

type WaitCase = [Parameters<typeof explainWait>[0], ReturnType<typeof explainWait>];

test.each<WaitCase>([
	[
		{ lastValid: 100, currentRound: 0, foundUnconfirmed: true },
		{ kind: 'expires-in', minutes: 6 }
	],
	[
		{ lastValid: 100, currentRound: 100, foundUnconfirmed: true },
		{ kind: 'expires-in', minutes: 1 }
	],
	[{ lastValid: 100, currentRound: 100, foundUnconfirmed: false }, { kind: 'confirming' }],
	[{ lastValid: 100, currentRound: 101, foundUnconfirmed: true }, { kind: 'window-ended' }],
	// The ended-window text appears only once the transaction was actually found unconfirmed
	// (otherwise a confirmed withdrawal would flash it while the first lookup is in flight).
	[{ lastValid: 100, currentRound: 101, foundUnconfirmed: false }, { kind: 'confirming' }],
	[{ lastValid: 100, currentRound: 0, foundUnconfirmed: false }, { kind: 'confirming' }],
	...[NaN, Infinity, -Infinity].flatMap((currentRound) =>
		[true, false].map(
			(foundUnconfirmed): WaitCase => [
				{ lastValid: 100, currentRound, foundUnconfirmed },
				{ kind: 'confirming' }
			]
		)
	),
	...[NaN, Infinity].map(
		(lastValid): WaitCase => [
			{ lastValid, currentRound: 100, foundUnconfirmed: true },
			{ kind: 'confirming' }
		]
	)
])('explains the unresolved wait for %j', (input, expected) => {
	expect(explainWait(input)).toEqual(expected);
});
