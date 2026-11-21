// These mirror the network's consensus parameters and genesis values. If the protocol
// changes them, update them here; the pinning test fails until they are re-checked.
export { INCENTIVE_KEYREG_FEE } from '$lib/chain/keyreg';

export const FEE_SINK_ADDRESS = 'TBEIGCNK4UCN3YDP2NODK3MJHTUZMYS3TABRM2MVSI2MPUR2V36E5JYHSY';
export const BLOCK_REWARD_MIN_MICROVOI = 30_000_000_000;
export const BLOCK_REWARD_MAX_MICROVOI = 70_000_000_000_000;
export const FEE_SHARE_PERCENT = 50;
export const BONUS_DECAY_INTERVAL = 1_000_000;
export const BONUS_DECAY_PERCENT = 1;
export const BALANCE_LOOKBACK_ROUNDS = 320;
export const BLOCK_REWARDS_START_ROUND = 23_944_225;
export const BLOCK_REWARD_NOTE_PREFIX = 'ProposerPayout for Round ';

// go-algorand absenteeism: an online account is absent (and suspended) once
// currentRound > lastSeen + ABSENT_FACTOR × totalOnlineStake ÷ accountStake.
export const ABSENT_FACTOR = 20;
// The heartbeat reads overdue at this fraction of the absenteeism window...
export const HEARTBEAT_OVERDUE_FRACTION = 0.5;
// ...but never sooner than this many rounds, so large accounts do not flicker.
export const HEARTBEAT_OVERDUE_FLOOR_ROUNDS = 1000;
