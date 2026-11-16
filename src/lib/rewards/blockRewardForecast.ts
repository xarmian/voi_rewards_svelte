import {
	BLOCK_REWARD_MAX_MICROVOI,
	BLOCK_REWARD_MIN_MICROVOI,
	BONUS_DECAY_INTERVAL,
	BONUS_DECAY_PERCENT,
	FEE_SHARE_PERCENT
} from './blockRewardConstants';

/** Micro-VOI throughout; blockTime and seconds in seconds. */
export type ForecastInput = {
	stake: number;
	onlineStake: number;
	blockTime: number;
	bonus: number;
	avgFees: number;
	round: number;
	seconds: number;
	eligible: boolean;
};
export type Forecast = {
	chance: number;
	expectedCount: number;
	range: [number, number];
	expectedMicroVoi: number;
};
export type PaceDay = { day: string; blocks: number; feesCollected: number };

export const FORECAST_PERIOD_SECONDS = {
	day: 86400,
	week: 7 * 86400,
	month: 30.44 * 86400,
	year: 365.25 * 86400
} as const;

export const FORECAST_ASSUMPTIONS =
	"Assumes this balance and total online stake stay the same, the account stays registered, block rewards stay funded, and blocks keep their recent pace. Each round's proposer is picked in proportion to stake.";

const LOW_PERCENTILE = 0.1;
const HIGH_PERCENTILE = 0.9;
const NORMAL_Z = 1.2816;
const NORMAL_THRESHOLD = 1000;
const PACE_DAYS = 7;

/** 10th and 90th percentiles of Poisson(lambda). */
function poissonRange(lambda: number): [number, number] {
	if (lambda > NORMAL_THRESHOLD) {
		const spread = NORMAL_Z * Math.sqrt(lambda);
		return [Math.max(0, Math.round(lambda - spread)), Math.max(0, Math.round(lambda + spread))];
	}
	// Relative weights from the mode outward stay in range where exp(-lambda) would underflow.
	const mode = Math.floor(lambda);
	const limit = Math.ceil(lambda + 12 * Math.sqrt(lambda) + 20);
	const weights = new Array<number>(limit + 1).fill(0);
	weights[mode] = 1;
	for (let k = mode; k > 0 && weights[k] > 0; k--) weights[k - 1] = (weights[k] * k) / lambda;
	for (let k = mode; k < limit; k++) weights[k + 1] = (weights[k] * lambda) / (k + 1);
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	let low = -1;
	let cumulative = 0;
	for (let k = 0; k <= limit; k++) {
		cumulative += weights[k] / total;
		if (low < 0 && cumulative >= LOW_PERCENTILE) low = k;
		if (cumulative >= HIGH_PERCENTILE) return [Math.max(low, 0), k];
	}
	return [Math.max(low, 0), limit];
}

/** Sum of per-round rewards over rounds round+1 .. round+rounds, one closed form per decay segment. */
function rewardSum(bonus: number, avgFees: number, round: number, rounds: number): number {
	const share = Math.floor((avgFees * FEE_SHARE_PERCENT) / 100);
	const decay = 1 - BONUS_DECAY_PERCENT / 100;
	const startSegment = Math.floor(round / BONUS_DECAY_INTERVAL);
	let sum = 0;
	let current = round + 1;
	let remaining = rounds;
	while (remaining > 0) {
		const segment = Math.floor(current / BONUS_DECAY_INTERVAL);
		const count = Math.min(remaining, (segment + 1) * BONUS_DECAY_INTERVAL - current);
		sum += count * (bonus * decay ** (segment - startSegment) + share);
		current += count;
		remaining -= count;
	}
	return sum;
}

export function forecastBlockRewards(input: ForecastInput): Forecast | null {
	const { stake, onlineStake, blockTime, bonus, avgFees, round, seconds, eligible } = input;
	if (
		!eligible ||
		![stake, onlineStake, blockTime, bonus, avgFees, round, seconds].every(Number.isFinite) ||
		stake < BLOCK_REWARD_MIN_MICROVOI ||
		stake > BLOCK_REWARD_MAX_MICROVOI ||
		onlineStake <= 0 ||
		blockTime <= 0 ||
		stake > onlineStake ||
		seconds < 0 ||
		bonus < 0 ||
		avgFees < 0 ||
		round < 0
	)
		return null;
	const p = stake / onlineStake;
	const rounds = seconds / blockTime;
	const lambda = rounds * p;
	return {
		chance: 1 - Math.exp(rounds * Math.log1p(-p)),
		expectedCount: lambda,
		range: poissonRange(lambda),
		expectedMicroVoi: p * rewardSum(bonus, avgFees, Math.floor(round), rounds)
	};
}

/** Block time and average fees per block over the last seven complete UTC days. */
export function networkPace(
	days: PaceDay[],
	now: Date
): { blockTime: number; avgFees: number } | null {
	const today = now.toISOString().slice(0, 10);
	const complete = days
		.filter((row) => row.day < today)
		.sort((a, b) => a.day.localeCompare(b.day))
		.slice(-PACE_DAYS);
	if (complete.length < PACE_DAYS) return null;
	const blocks = complete.reduce((sum, row) => sum + row.blocks, 0);
	if (!(blocks > 0)) return null;
	const fees = complete.reduce((sum, row) => sum + row.feesCollected, 0);
	return { blockTime: (PACE_DAYS * 86400) / blocks, avgFees: fees / blocks };
}
