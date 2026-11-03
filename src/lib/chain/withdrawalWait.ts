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
