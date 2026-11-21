import { FALLBACK_BLOCK_TIME } from '$lib/chain/blockTime';
import { onChainKeyregOffer, type ContractIncentive, type OnChainAccount } from '$lib/chain/keyreg';
import {
	ABSENT_FACTOR,
	BLOCK_REWARD_MAX_MICROVOI,
	BLOCK_REWARD_MIN_MICROVOI,
	HEARTBEAT_OVERDUE_FLOOR_ROUNDS,
	HEARTBEAT_OVERDUE_FRACTION
} from '$lib/rewards/blockRewardConstants';
import {
	blockRewardContractOf,
	blockRewardStatus,
	type BlockRewardAccount,
	type BlockRewardStatus
} from '$lib/rewards/blockRewardStatus';

type Whole = number | bigint;

/** The engine's real-time block reward status, and whether the 2 VOI on-chain re-registration applies. */
export type Eligibility = { status: BlockRewardStatus; canMakeEligible: boolean };

/** Ages are seconds at the fallback block time; null when that event is not on record. */
export type Heartbeat = {
	lastProposedSeconds: number | null;
	lastHeartbeatSeconds: number | null;
	/** Rounds since the later of the two. */
	silentRounds: number;
	/** Rounds of silence after which the account reads overdue; null without online stake. */
	overdueAfter: number | null;
	/** null when online stake was unavailable, so no verdict is given. */
	overdue: boolean | null;
};

export type AccountHealth = { eligibility: Eligibility | null; heartbeat: Heartbeat | null };

/**
 * The single place that combines the engine with the on-chain offer. `contract` is null for an
 * ordinary account; any contract classification other than 'capable' reads as incapable.
 */
export function accountEligibility(
	address: string,
	account: BlockRewardAccount & OnChainAccount,
	contract: ContractIncentive | null
): Eligibility {
	const offer = onChainKeyregOffer(address, account, {
		isStakingContract: contract !== null,
		contractIncentive: contract ?? 'unverified',
		balanceRange: { min: BLOCK_REWARD_MIN_MICROVOI, max: BLOCK_REWARD_MAX_MICROVOI }
	});
	return {
		status: blockRewardStatus(account, { contract: blockRewardContractOf(contract) }),
		canMakeEligible: offer.kind === 'offer'
	};
}

const round = (value: Whole | undefined | null): number | null => {
	if (value === undefined || value === null) return null;
	const n = Number(value);
	return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Half the absenteeism window, at least the floor; null without online stake or a balance. */
export function heartbeatOverdueRounds(amount: Whole, onlineStake: number | null): number | null {
	const stake = Number(amount);
	if (onlineStake === null || !Number.isFinite(onlineStake) || !(stake > 0)) return null;
	return Math.max(
		HEARTBEAT_OVERDUE_FLOOR_ROUNDS,
		(HEARTBEAT_OVERDUE_FRACTION * ABSENT_FACTOR * onlineStake) / stake
	);
}

/**
 * Last seen is the later of last proposed and last heartbeat (algod's lastHeartbeat also records
 * the round the account last went online). Null when neither is on record.
 */
export function heartbeatHealth(input: {
	round: Whole;
	lastProposed?: Whole;
	lastHeartbeat?: Whole;
	amount: Whole;
	onlineStake: number | null;
}): Heartbeat | null {
	const current = round(input.round);
	const proposed = round(input.lastProposed);
	const heartbeat = round(input.lastHeartbeat);
	if (current === null || (proposed === null && heartbeat === null)) return null;
	const age = (seen: number | null) =>
		seen === null ? null : Math.max(0, current - seen) * FALLBACK_BLOCK_TIME;
	const silentRounds = Math.max(0, current - Math.max(proposed ?? 0, heartbeat ?? 0));
	const overdueAfter = heartbeatOverdueRounds(input.amount, input.onlineStake);
	return {
		lastProposedSeconds: age(proposed),
		lastHeartbeatSeconds: age(heartbeat),
		silentRounds,
		overdueAfter,
		overdue: overdueAfter === null ? null : silentRounds > overdueAfter
	};
}
