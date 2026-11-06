/** Epoch seconds. Zero-lockup contracts vest from funding, without a delay offset. */
export function vestingStartTime(
	fundingTime: number,
	lockupPeriod: number,
	vestingDelay: number,
	periodSeconds: number
): number {
	return lockupPeriod === 0
		? fundingTime
		: fundingTime + lockupPeriod + Math.max(1, vestingDelay) * periodSeconds;
}
