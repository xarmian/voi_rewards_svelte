import { expect, it } from 'vitest';
import * as constants from './blockRewardConstants';

it('pins the consensus and genesis block reward parameters', () => {
	expect(constants.FEE_SINK_ADDRESS).toBe(
		'TBEIGCNK4UCN3YDP2NODK3MJHTUZMYS3TABRM2MVSI2MPUR2V36E5JYHSY'
	);
	expect(constants.BLOCK_REWARD_MIN_MICROVOI).toBe(30_000_000_000);
	expect(constants.BLOCK_REWARD_MAX_MICROVOI).toBe(70_000_000_000_000);
	expect(constants.FEE_SHARE_PERCENT).toBe(50);
	expect(constants.BONUS_DECAY_INTERVAL).toBe(1_000_000);
	expect(constants.BONUS_DECAY_PERCENT).toBe(1);
	expect(constants.BALANCE_LOOKBACK_ROUNDS).toBe(320);
	expect(constants.BLOCK_REWARDS_START_ROUND).toBe(23_944_225);
	expect(constants.BLOCK_REWARD_NOTE_PREFIX).toBe('ProposerPayout for Round ');
	expect(constants.INCENTIVE_KEYREG_FEE).toBe(2_000_000);
});
