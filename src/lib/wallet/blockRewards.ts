import { FEE_SHARE_PERCENT } from '$lib/rewards/blockRewardConstants';
import { readBonus, readFeeSink } from '$lib/rewards/blockRewardChain';
import {
	blockRewardContractOf,
	blockRewardFunding,
	blockRewardStatus,
	type BlockRewardFunding,
	type BlockRewardStatus
} from '$lib/rewards/blockRewardStatus';
import { contractIncentiveOf } from '$lib/chain/keyreg';
import { requireAccountInfo } from '$lib/stores/accounts';
import { algodClient } from '$lib/utils/algod';
import { boundedRead } from './read';
import { json } from './rewards';

/** Amounts are micro-VOI integers; time is an ISO UTC string. */
export type BlockReward = {
	round: number;
	time: string;
	txid: string;
	amount: number;
	bonus: number;
	feesCollected: number;
	partial: boolean;
};
export type BlockRewardDay = { day: string; count: number; amount: number };
export type NetworkBlockRewardDay = {
	day: string;
	blocks: number;
	rewardedBlocks: number;
	amount: number;
	feesCollected: number;
	lastRound: number | null;
};

export const BLOCK_REWARD_PAGE_SIZE = 100;
export const BLOCK_REWARD_LAG_ALERT_ROUNDS = 200;

const INVALID = 'Invalid block reward data';

const record = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);

function integer(value: unknown, min = 0): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
		throw new Error(INVALID);
	return value;
}

function day(value: unknown): string {
	if (
		typeof value !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
		Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
		new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
	)
		throw new Error(INVALID);
	return value;
}

function time(value: unknown): string {
	if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(INVALID);
	return new Date(value).toISOString();
}

async function rows<T>(
	params: Record<string, string>,
	force: boolean,
	map: (row: Record<string, unknown>) => T
): Promise<T[]> {
	const result = await json(`/api/mimir?${new URLSearchParams(params)}`, force);
	if (!record(result) || !Array.isArray(result.data)) throw new Error(INVALID);
	return result.data.map((row) => {
		if (!record(row)) throw new Error(INVALID);
		return map(row);
	});
}

/** Whether a reward paid less than the bonus plus the proposer's fee share. */
export function isPartialBlockReward(row: {
	amount: number;
	bonus: number;
	feesCollected: number;
}): boolean {
	const full = row.bonus + Math.floor((row.feesCollected * FEE_SHARE_PERCENT) / 100);
	if (row.amount > full)
		console.warn(
			`Block reward ${row.amount} exceeds bonus plus fee share ${full}; reward constants may be stale.`
		);
	return row.amount < full;
}

export async function loadBlockRewards(
	address: string,
	beforeRound: number = Number.MAX_SAFE_INTEGER,
	force = false
): Promise<BlockReward[]> {
	return rows(
		{
			action: 'get_block_rewards',
			p_address: address,
			p_before_round: String(beforeRound),
			p_limit: String(BLOCK_REWARD_PAGE_SIZE)
		},
		force,
		(row) => {
			if (typeof row.txid !== 'string' || !row.txid) throw new Error(INVALID);
			const reward = {
				round: integer(row.round, 1),
				time: time(row.realtime),
				txid: row.txid,
				amount: integer(row.amount),
				bonus: integer(row.bonus),
				feesCollected: integer(row.fees_collected)
			};
			return { ...reward, partial: isPartialBlockReward(reward) };
		}
	);
}

export async function loadBlockRewardsDaily(
	address: string,
	days: number,
	force = false
): Promise<BlockRewardDay[]> {
	return rows(
		{ action: 'get_block_rewards_daily', p_address: address, p_days: String(days) },
		force,
		(row) => ({
			day: day(row.day),
			count: integer(row.block_rewards),
			amount: integer(row.amount)
		})
	);
}

export async function loadNetworkBlockRewardsDaily(
	days: number,
	force = false
): Promise<NetworkBlockRewardDay[]> {
	return rows(
		{ action: 'get_block_rewards_network_daily', p_days: String(days) },
		force,
		(row) => ({
			day: day(row.day),
			blocks: integer(row.blocks),
			rewardedBlocks: integer(row.rewarded_blocks),
			amount: integer(row.amount),
			feesCollected: integer(row.fees_collected),
			lastRound: row.last_round === null ? null : integer(row.last_round, 1)
		})
	);
}

/** Rounds the indexed data trails the chain, or null when no day has a recorded round. */
export function mimirLagRounds(lastRound: number, days: NetworkBlockRewardDay[]): number | null {
	const rounds = days.flatMap((row) => (row.lastRound === null ? [] : [row.lastRound]));
	return rounds.length ? Math.max(0, lastRound - Math.max(...rounds)) : null;
}

/** A status read, with the classification it was read for (see currentStatus). */
export type BlockRewardStatusRead = BlockRewardStatus & { balance: number; isContract: boolean };

/**
 * A contract's program is read to tell whether it is capable; a contract with no known id, or
 * whose program cannot be read, counts as incapable.
 */
export async function loadBlockRewardStatus(
	address: string,
	opts: { isContract: boolean; contractId?: number | null; force?: boolean }
): Promise<BlockRewardStatusRead> {
	const contractId = opts.contractId ?? null;
	const [account, incentive] = await Promise.all([
		boundedRead(requireAccountInfo(address, { force: opts.force ?? false })),
		!opts.isContract
			? null
			: contractId === null
				? ('unverified' as const)
				: contractIncentiveOf(
						async () =>
							(await boundedRead(algodClient.getApplicationByID(contractId).do())).params
								?.approvalProgram
					)
	]);
	const balance = Number(account.amount);
	if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Account balance unavailable');
	return {
		...blockRewardStatus(account, { contract: blockRewardContractOf(incentive) }),
		balance,
		isContract: opts.isContract
	};
}

/** Funding is 'unknown' whenever either read fails; a failed read never reports 'paused'. */
export async function loadBlockRewardFunding(): Promise<{
	funding: BlockRewardFunding;
	bonus: number | null;
}> {
	const [sink, bonus] = await Promise.allSettled([
		boundedRead(readFeeSink()),
		boundedRead(readBonus())
	]);
	const value = bonus.status === 'fulfilled' ? bonus.value.bonus : null;
	if (sink.status !== 'fulfilled' || value === null) return { funding: 'unknown', bonus: value };
	return { funding: blockRewardFunding(sink.value, value), bonus: value };
}
