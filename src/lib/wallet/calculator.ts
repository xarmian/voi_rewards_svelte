import { get } from 'svelte/store';
import { requireAccountInfo, getSupplyInfo } from '$lib/stores/accounts';
import { voiPrice, fetchVoiPrice } from '$lib/stores/price';
import { getTokensByEpoch } from '$lib/utils';
import { dataTable } from '../../stores/dataTable';
import { getCurrentEpoch } from '$lib/utils/epoch-utils';
import { boundedRead } from './read';

export async function loadCalculatorBalance(address: string, force = false): Promise<number> {
	const account = await boundedRead(requireAccountInfo(address, { force }));
	const amount = Number(account.amount);
	if (
		account.amount == null ||
		(typeof account.amount === 'string' && !String(account.amount).trim()) ||
		!Number.isFinite(amount) ||
		amount < 0
	)
		throw new Error('Wallet balance unavailable');
	return amount / 1e6;
}
export async function loadCalculatorPrice(_address = '', force = false): Promise<number> {
	void _address;
	await boundedRead(fetchVoiPrice(force));
	const quote = get(voiPrice);
	if (quote.error || !Number.isFinite(quote.price) || quote.price <= 0)
		throw new Error('Market price unavailable');
	return quote.price;
}
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
