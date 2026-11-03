export function minutesUntilExpiry(
	lastValid: number,
	currentRound: number,
	secondsPerRound = 3.3
): number | null {
	if (!Number.isFinite(lastValid) || !Number.isFinite(currentRound) || currentRound > lastValid) {
		return null;
	}
	return Math.max(1, Math.ceil(((lastValid - currentRound) * secondsPerRound) / 60));
}

export function explainWait(input: {
	lastValid: number;
	currentRound: number;
	foundUnconfirmed: boolean;
}): { kind: 'confirming' } | { kind: 'expires-in'; minutes: number } | { kind: 'window-ended' } {
	// Only once the transaction was found unconfirmed: a confirmed one must not flash this text.
	if (
		input.foundUnconfirmed &&
		Number.isFinite(input.currentRound) &&
		input.currentRound > input.lastValid
	) {
		return { kind: 'window-ended' };
	}
	const minutes = minutesUntilExpiry(input.lastValid, input.currentRound);
	return input.foundUnconfirmed && minutes !== null
		? { kind: 'expires-in', minutes }
		: { kind: 'confirming' };
}
