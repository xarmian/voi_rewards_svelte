import { createReadSource, type Source } from '$lib/wallet/read';
import { EPOCH_REWARDS_ENABLED } from '../config';
import { loadCalculatorInputs, type CalculatorInputs } from './inputs';
import { scheduleRows, type ScheduleRow } from './schedule';

export const EPOCH_START_DATE = new Date('2024-10-30');

/** The calculator's epoch inputs and schedules, as its reader last published them. */
export type EpochCalculatorState = {
	network: Source<CalculatorInputs>;
	isLoading: boolean;
	loadError: string;
	supply: { 'online-money': number } | null;
	rewardStake: number;
	epochRewards: number[];
	epochSchedule: ScheduleRow[];
	pastEpochSchedule: ScheduleRow[];
};

/**
 * The calculator's epoch reads: the network inputs (online stake, the blacklist row and a
 * year of pools) and the schedules built from them. Nothing is read until `load`.
 */
export function createEpochCalculator() {
	const state: EpochCalculatorState = $state({
		network: { state: 'loading' },
		isLoading: true,
		loadError: '',
		supply: null,
		rewardStake: 0,
		epochRewards: [],
		epochSchedule: [],
		pastEpochSchedule: []
	});
	let address = '';
	const reader = createReadSource(loadCalculatorInputs, (result) => {
		state.network = result;
		state.isLoading = result.state === 'loading';
		state.loadError = result.state === 'error' ? 'Calculator inputs unavailable' : '';
		if (result.value) {
			state.supply = { 'online-money': result.value.onlineMoney };
			state.rewardStake = result.value.rewardStake;
			state.epochRewards = result.value.epochRewards;
			const date = new Date();
			state.epochSchedule = scheduleRows(
				result.value.epochRewards,
				result.value.currentEpochNumber,
				EPOCH_START_DATE,
				date
			);
			const past = result.value.pastEpochRewards;
			state.pastEpochSchedule = scheduleRows(
				past,
				result.value.currentEpochNumber - past.length,
				EPOCH_START_DATE,
				date
			)
				.slice(0, past.length)
				.map((row) => ({ ...row, isCurrent: false }));
		} else {
			state.supply = null;
			state.rewardStake = 0;
			state.epochRewards = [];
			state.epochSchedule = [];
			state.pastEpochSchedule = [];
		}
	});
	return {
		state,
		/** Starts the network read for the page's address. */
		load(requested: string, force = false) {
			address = requested;
			return reader.load(requested, force);
		},
		/** Retries the network read for the last address, bypassing the caches. */
		reload() {
			return reader.load(address, true);
		},
		dispose() {
			reader.dispose();
		}
	};
}

export type EpochCalculator = ReturnType<typeof createEpochCalculator>;

/** The calculator's epoch half, or null when epoch rewards are off (then nothing is read). */
export function epochCalculator(): EpochCalculator | null {
	return EPOCH_REWARDS_ENABLED ? createEpochCalculator() : null;
}
