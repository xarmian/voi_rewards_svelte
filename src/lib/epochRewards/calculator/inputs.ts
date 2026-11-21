import { getSupplyInfo } from '$lib/stores/accounts';
import { getTokensByEpoch } from '$lib/utils';
import { dataTable } from '../dataTable';
import { getCurrentEpoch } from '$lib/utils/epoch-utils';
import { boundedRead } from '$lib/wallet/read';

/** Required network inputs are independent of the optional page prefill and USD quote. */
export async function loadCalculatorInputs(_address = '', force = false) {
	void _address;
	const [supply, dates] = await Promise.all([
		boundedRead(getSupplyInfo()),
		boundedRead(dataTable.fetchDateRanges(force))
	]);
	const latest = dates.at(-1);
	if (
		!latest ||
		!Number.isSafeInteger(latest.epoch) ||
		latest.epoch < 1 ||
		!supply ||
		!Number.isFinite(supply['online-money']) ||
		supply['online-money'] <= 0
	)
		throw new Error('Calculator inputs unavailable');
	const [raw, epochRewards] = await Promise.all([
		boundedRead(dataTable.fetchData(latest.id, force)),
		boundedRead(
			Promise.all(Array.from({ length: 52 }, (_, index) => getTokensByEpoch(latest.epoch + index)))
		)
	]);
	const blacklistValue =
		raw && typeof raw === 'object' && 'blacklist_balance_total' in raw
			? raw.blacklist_balance_total
			: undefined;
	const blacklist =
		raw && typeof raw === 'object' && 'blacklist_balance_total' in raw
			? Number(raw.blacklist_balance_total)
			: NaN;
	if (
		blacklistValue == null ||
		blacklistValue === '' ||
		!Number.isFinite(blacklist) ||
		blacklist < 0 ||
		blacklist >= supply['online-money'] ||
		epochRewards.some((pool) => !Number.isFinite(pool) || pool < 0)
	)
		throw new Error('Calculator inputs unavailable');
	const currentEpochNumber = getCurrentEpoch(new Date(), new Date('2024-10-30'));
	const count = Math.min(12, currentEpochNumber);
	const pastEpochRewards = await boundedRead(
		Promise.all(
			Array.from({ length: count }, (_, index) =>
				getTokensByEpoch(currentEpochNumber - (count - index) + 1)
			)
		)
	);
	if (pastEpochRewards.some((pool) => !Number.isFinite(pool) || pool < 0))
		throw new Error('Reward schedule unavailable');
	return {
		currentEpochNumber,
		pastEpochRewards,
		onlineMoney: supply['online-money'],
		rewardStake: supply['online-money'] - blacklist,
		epochRewards
	};
}

export type CalculatorInputs = Awaited<ReturnType<typeof loadCalculatorInputs>>;

/** The CSV's reward pools: twenty years of epochs from epoch 1, read one after another. */
export async function epochScheduleAmounts(): Promise<number[]> {
	const amounts: number[] = [];
	for (let epoch = 0; epoch < 20 * 52; epoch++) {
		amounts.push(await getTokensByEpoch(epoch + 1));
	}
	return amounts;
}
