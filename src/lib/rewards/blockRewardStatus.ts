import {
	BALANCE_LOOKBACK_ROUNDS,
	BLOCK_REWARD_MAX_MICROVOI,
	BLOCK_REWARD_MIN_MICROVOI
} from './blockRewardConstants';

export type BlockRewardReason =
	| 'contract'
	| 'suspended'
	| 'not-opted-in'
	| 'offline'
	| 'keys-expired'
	| 'below-range'
	| 'above-range';
export type BlockRewardAccount = {
	status: string;
	incentiveEligible?: boolean;
	amount: bigint | number;
	round: bigint | number;
	participation?: { voteLastValid: bigint | number } | null;
};
export type BlockRewardStatus = {
	registered: boolean;
	reasons: { code: BlockRewardReason; text: string }[];
};
export type BlockRewardFunding = 'funded' | 'paused' | 'unknown';

const voi = (micro: number) => (micro / 1e6).toLocaleString('en-US');

export const BLOCK_REWARD_STATUS_TEXT: Record<BlockRewardReason | 'registered', string> = {
	registered: 'Registered for real-time block rewards',
	suspended: 'Taken offline for missing proposals (suspended).',
	'not-opted-in': 'Online without the 2 VOI incentive fee.',
	offline: 'Account is offline.',
	'keys-expired': 'Participation keys expired.',
	'below-range': `Balance below ${voi(BLOCK_REWARD_MIN_MICROVOI)} VOI: no real-time block rewards while outside this range.`,
	'above-range': `Balance above ${voi(BLOCK_REWARD_MAX_MICROVOI)} VOI: no real-time block rewards while outside this range.`,
	contract:
		"Staking contracts don't earn real-time block rewards yet. Contract upgrades are being worked on, and epoch rewards continue until contracts are upgraded to support real-time block rewards."
};
export const BLOCK_REWARD_LOOKBACK_NOTE = `Changes take effect after about ${BALANCE_LOOKBACK_ROUNDS} rounds (~15 minutes).`;
export const BLOCK_REWARDS_PAUSED_TEXT =
	'Real-time block rewards are paused while they are in testing. Epoch rewards continue until testing is complete.';
export const BLOCK_REWARDS_UNKNOWN_TEXT = 'Real-time block reward status unavailable';

const big = (value: bigint | number) => (typeof value === 'bigint' ? value : BigInt(value));

export function blockRewardStatus(
	account: BlockRewardAccount,
	opts: { isContract: boolean }
): BlockRewardStatus {
	const online = account.status === 'Online';
	const eligible = account.incentiveEligible === true;
	const amount = big(account.amount);
	const participation = account.participation ?? null;
	const keysLive = participation !== null && big(participation.voteLastValid) >= big(account.round);
	const below = amount < BigInt(BLOCK_REWARD_MIN_MICROVOI);
	const above = amount > BigInt(BLOCK_REWARD_MAX_MICROVOI);
	if (online && eligible && !below && !above && keysLive && !opts.isContract)
		return { registered: true, reasons: [] };
	const codes: BlockRewardReason[] = [];
	if (opts.isContract) codes.push('contract');
	if (!online && participation !== null && !eligible) codes.push('suspended');
	if (!online && (participation === null || eligible)) codes.push('offline');
	if (online && !eligible) codes.push('not-opted-in');
	if (online && participation !== null && !keysLive) codes.push('keys-expired');
	if (below) codes.push('below-range');
	if (above) codes.push('above-range');
	if (!codes.length) codes.push('offline');
	return {
		registered: false,
		reasons: codes.map((code) => ({ code, text: BLOCK_REWARD_STATUS_TEXT[code] }))
	};
}

export function blockRewardFunding(
	sink: { amount: bigint | number; minBalance: bigint | number } | null,
	bonus: bigint | number | null
): BlockRewardFunding {
	if (sink === null || bonus === null) return 'unknown';
	const spendable = big(sink.amount) - big(sink.minBalance);
	return spendable < big(bonus) ? 'paused' : 'funded';
}
