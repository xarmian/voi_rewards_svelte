import { comma, MISSING } from '$lib/ds/format';
import {
	BLOCK_REWARD_MAX_MICROVOI,
	BLOCK_REWARD_MIN_MICROVOI,
	INCENTIVE_KEYREG_FEE
} from '$lib/rewards/blockRewardConstants';
import {
	FORECAST_PERIOD_SECONDS,
	forecastBlockRewards,
	networkPace,
	type Forecast
} from '$lib/rewards/blockRewardForecast';
import type { loadBlockRewardFunding, NetworkBlockRewardDay } from '$lib/wallet/blockRewards';
import type { Source } from '$lib/wallet/read';

export type CalculatorBlockRewardsState = {
	funding: Source<Awaited<ReturnType<typeof loadBlockRewardFunding>>>;
	network: Source<NetworkBlockRewardDay[]>;
	onlineStake: Source<number>;
	lastRound: Source<number>;
};
export type CalculatorBlockRewardSource = keyof CalculatorBlockRewardsState;
export const CALCULATOR_BLOCK_REWARD_SOURCES: CalculatorBlockRewardSource[] = [
	'funding',
	'network',
	'onlineStake',
	'lastRound'
];

export function createCalculatorBlockRewardsState(): CalculatorBlockRewardsState {
	return {
		funding: { state: 'loading' },
		network: { state: 'loading' },
		onlineStake: { state: 'loading' },
		lastRound: { state: 'loading' }
	};
}

export type CalculatorBlockRewardInputs =
	| { kind: 'loading' | 'error' | 'invalid-stake' | 'out-of-range' }
	| {
			kind: 'ready';
			/** Stake in micro-VOI. */
			stake: number;
			day: Forecast;
			month: Forecast;
			year: Forecast;
			next24h: Forecast;
			next7d: Forecast;
	  };

export const OUT_OF_RANGE_TEXT = `No real-time block rewards: stake must be between ${comma(BLOCK_REWARD_MIN_MICROVOI / 1e6)} and ${comma(BLOCK_REWARD_MAX_MICROVOI / 1e6)} VOI.`;
export const BLOCK_REWARD_FEE_NOTE = `Requires going online with the ${comma(INCENTIVE_KEYREG_FEE / 1e6)} VOI incentive fee. Staking contracts cannot pay it.`;

/**
 * Forecasts for a stake in VOI, assuming a registered account. As on the wallet pages, the
 * pace comes from the network rows judged at the time they were read; without a recent pace
 * there is no forecast rather than a fallback block time.
 */
export function calculatorBlockRewardInputs(
	voi: number | null | undefined,
	sources: CalculatorBlockRewardsState
): CalculatorBlockRewardInputs {
	if (typeof voi !== 'number' || !Number.isFinite(voi) || voi <= 0)
		return { kind: 'invalid-stake' };
	const stake = Math.round(voi * 1e6);
	if (stake < BLOCK_REWARD_MIN_MICROVOI || stake > BLOCK_REWARD_MAX_MICROVOI)
		return { kind: 'out-of-range' };
	if (CALCULATOR_BLOCK_REWARD_SOURCES.some((key) => sources[key].state === 'loading'))
		return { kind: 'loading' };
	const onlineStake = sources.onlineStake.value;
	const round = sources.lastRound.value;
	const bonus = sources.funding.value?.bonus;
	const network = sources.network;
	const pace = network.value ? networkPace(network.value, new Date(network.asOf)) : null;
	if (onlineStake === undefined || round === undefined || bonus == null || !pace)
		return { kind: 'error' };
	const forecast = (seconds: number) =>
		forecastBlockRewards({
			stake,
			onlineStake,
			blockTime: pace.blockTime,
			avgFees: pace.avgFees,
			bonus,
			round,
			seconds,
			eligible: true
		});
	const day = forecast(FORECAST_PERIOD_SECONDS.day);
	const month = forecast(FORECAST_PERIOD_SECONDS.month);
	const year = forecast(FORECAST_PERIOD_SECONDS.year);
	const next7d = forecast(FORECAST_PERIOD_SECONDS.week);
	if (!day || !month || !year || !next7d) return { kind: 'error' };
	return { kind: 'ready', stake, day, month, year, next24h: day, next7d };
}

/** Simple yearly rate, expected yearly rewards over the stake, with no compounding. */
export function rateText(year: Forecast, stakeMicroVoi: number): string {
	const rate = (year.expectedMicroVoi / stakeMicroVoi) * 100;
	const shown = stakeMicroVoi > 0 && Number.isFinite(rate) ? `${rate.toFixed(2)}%` : MISSING;
	return `≈ ${shown} a year while funded`;
}
