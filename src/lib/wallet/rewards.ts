import { config } from '$lib/config';
import { finite } from '$lib/home/headline';
import { requireAccountInfo, onlineStakeStore } from '$lib/stores/accounts';
import type { EpochRewardsState } from '$lib/epochRewards';
import { boundedRead, type Source } from './read';

export type RewardAccount = { balance: number; online: boolean };
export type DailyStake = { date: string; avg_online_stake: number };
/** The rewards tab's sources; the epoch ones are present only while epoch rewards are on. */
export type RewardsState = {
	daily: Source<Record<string, unknown[]>>;
	account: Source<RewardAccount>;
	dailyStake: Source<DailyStake[]>;
} & Partial<EpochRewardsState>;
export function createRewardsState(): RewardsState {
	return {
		daily: { state: 'loading' },
		account: { state: 'loading' },
		dailyStake: { state: 'loading' }
	};
}
export const record = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);
export function count(value: unknown): number {
	const number = finite(value);
	if (number === null || !Number.isSafeInteger(number) || number < 0)
		throw new Error('Invalid block count');
	return number;
}
export async function json(url: string, force = false): Promise<unknown> {
	return boundedRead(
		fetch(url, { cache: force ? 'no-store' : 'default', signal: AbortSignal.timeout(15000) }).then(
			async (response) => {
				if (!response.ok) throw new Error(`Request failed: HTTP ${response.status}`);
				const result: unknown = await response.json();
				if (record(result) && 'error' in result) throw new Error('Source unavailable');
				return result;
			}
		)
	);
}
export async function loadRewardAccount(address: string, force = false): Promise<RewardAccount> {
	const raw = await boundedRead(requireAccountInfo(address, { force }));
	const amount = Number(raw.amount);
	if (
		raw.amount == null ||
		(typeof raw.amount === 'string' && !String(raw.amount).trim()) ||
		!Number.isFinite(amount) ||
		amount < 0 ||
		typeof raw.status !== 'string'
	)
		throw new Error('Account balance unavailable');
	return { balance: amount / 1e6, online: raw.status === 'Online' };
}
export async function loadDailyStake(_address: string, force = false): Promise<DailyStake[]> {
	const raw = await boundedRead(force ? onlineStakeStore.refresh() : onlineStakeStore.getData());
	if (!Array.isArray(raw)) throw new Error('Daily stake unavailable');
	return raw.map((item) => {
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
			!Number.isFinite(item.avg_online_stake) ||
			item.avg_online_stake <= 0
		)
			throw new Error('Invalid daily stake');
		return item;
	});
}
export async function loadDailyProposals(
	address: string,
	force = false
): Promise<Record<string, unknown[]>> {
	const raw = await json(
		`${config.proposalApiBaseUrl}?action=proposals&wallet=${encodeURIComponent(address)}`,
		force
	);
	if (
		!record(raw) ||
		Object.entries(raw).some(
			([date, value]) =>
				!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
				!Number.isFinite(Date.parse(date)) ||
				!Array.isArray(value)
		)
	)
		throw new Error('Invalid daily proposals');
	return raw as Record<string, unknown[]>;
}
export function dailyProposals(
	raw: Record<string, unknown[]>,
	balanceMicro: number | null,
	stakes: DailyStake[],
	now: Date
) {
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return Array.from({ length: 30 }, (_, index) => {
		const date = new Date(today - (29 - index) * 86400000).toISOString().slice(0, 10);
		const stake = stakes.find((row) => row.date === date)?.avg_online_stake;
		return {
			date,
			actual: Array.isArray(raw[date]) ? raw[date].length : null,
			expected:
				balanceMicro !== null && stake !== undefined && stake > 0
					? (balanceMicro / 1e6 / (stake / 1e6)) * (86400 / 2.8)
					: null,
			current: index === 29
		};
	});
}
