import { describe, expect, it } from 'vitest';
import {
	BLOCK_REWARD_LOOKBACK_NOTE,
	BLOCK_REWARD_STATUS_TEXT,
	BLOCK_REWARDS_PAUSED_TEXT,
	BLOCK_REWARDS_UNKNOWN_TEXT,
	blockRewardFunding,
	blockRewardStatus,
	type BlockRewardAccount
} from './blockRewardStatus';

const account = (overrides: Partial<BlockRewardAccount> = {}): BlockRewardAccount => ({
	status: 'Online',
	incentiveEligible: true,
	amount: 100_000_000_000n,
	round: 1000n,
	participation: { voteLastValid: 5000n },
	...overrides
});
const codes = (value: BlockRewardAccount, isContract = false) =>
	blockRewardStatus(value, { isContract }).reasons.map((reason) => reason.code);

describe('blockRewardStatus', () => {
	it('registers an online, eligible, in-range account with live keys', () => {
		expect(blockRewardStatus(account(), { isContract: false })).toEqual({
			registered: true,
			reasons: []
		});
	});

	it('treats both balance bounds as inclusive', () => {
		expect(blockRewardStatus(account({ amount: 30_000_000_000n }), { isContract: false })).toEqual({
			registered: true,
			reasons: []
		});
		expect(
			blockRewardStatus(account({ amount: 70_000_000_000_000n }), { isContract: false }).registered
		).toBe(true);
		expect(codes(account({ amount: 29_999_999_999n }))).toEqual(['below-range']);
		expect(codes(account({ amount: 70_000_000_000_001n }))).toEqual(['above-range']);
	});

	it('accepts number inputs', () => {
		expect(
			blockRewardStatus(
				account({ amount: 30_000_000_000, round: 10, participation: { voteLastValid: 10 } }),
				{ isContract: false }
			).registered
		).toBe(true);
	});

	it('reports a suspended account', () => {
		expect(codes(account({ status: 'Offline', incentiveEligible: false }))).toEqual(['suspended']);
		expect(codes(account({ status: 'Offline', incentiveEligible: undefined }))).toEqual([
			'suspended'
		]);
	});

	it('reports an offline account', () => {
		expect(codes(account({ status: 'Offline', participation: undefined }))).toEqual(['offline']);
		expect(codes(account({ status: 'Offline', participation: null }))).toEqual(['offline']);
		expect(codes(account({ status: 'Offline' }))).toEqual(['offline']);
	});

	it('reports an online account without the incentive fee', () => {
		expect(codes(account({ incentiveEligible: false }))).toEqual(['not-opted-in']);
		expect(codes(account({ incentiveEligible: undefined }))).toEqual(['not-opted-in']);
	});

	it('reports expired participation keys', () => {
		expect(codes(account({ participation: { voteLastValid: 999n } }))).toEqual(['keys-expired']);
		expect(codes(account({ participation: { voteLastValid: 1000n } }))).toEqual([]);
	});

	it('falls back to offline for an online account with no participation', () => {
		expect(codes(account({ participation: undefined }))).toEqual(['offline']);
	});

	it('lists every applying reason in order', () => {
		expect(
			codes(
				account({
					incentiveEligible: false,
					participation: { voteLastValid: 10n },
					amount: 1_000_000n
				})
			)
		).toEqual(['not-opted-in', 'keys-expired', 'below-range']);
		expect(
			codes(account({ status: 'Offline', incentiveEligible: false, amount: 1n }), true)
		).toEqual(['contract', 'suspended', 'below-range']);
	});

	it('never registers a contract', () => {
		const status = blockRewardStatus(account(), { isContract: true });
		expect(status.registered).toBe(false);
		expect(status.reasons).toEqual([{ code: 'contract', text: BLOCK_REWARD_STATUS_TEXT.contract }]);
	});

	it('attaches the exact text to each reason', () => {
		const status = blockRewardStatus(account({ incentiveEligible: false, amount: 1n }), {
			isContract: false
		});
		expect(status.reasons).toEqual([
			{ code: 'not-opted-in', text: 'Online without the 2 VOI incentive fee.' },
			{
				code: 'below-range',
				text: 'Balance below 30,000 VOI: no real-time block rewards while outside this range.'
			}
		]);
	});

	it('uses the exact texts', () => {
		expect(BLOCK_REWARD_STATUS_TEXT).toEqual({
			registered: 'Registered for real-time block rewards',
			suspended: 'Taken offline for missing proposals (suspended).',
			'not-opted-in': 'Online without the 2 VOI incentive fee.',
			offline: 'Account is offline.',
			'keys-expired': 'Participation keys expired.',
			'below-range':
				'Balance below 30,000 VOI: no real-time block rewards while outside this range.',
			'above-range':
				'Balance above 70,000,000 VOI: no real-time block rewards while outside this range.',
			contract:
				"Staking contracts don't earn real-time block rewards yet. Contract upgrades are being worked on, and epoch rewards continue until contracts are upgraded to support real-time block rewards."
		});
		expect(BLOCK_REWARD_LOOKBACK_NOTE).toBe(
			'Changes take effect after about 320 rounds (~15 minutes).'
		);
		expect(BLOCK_REWARDS_PAUSED_TEXT).toBe(
			'Real-time block rewards are paused while they are in testing. Epoch rewards continue until testing is complete.'
		);
		expect(BLOCK_REWARDS_UNKNOWN_TEXT).toBe('Real-time block reward status unavailable');
	});

	it('contains no forbidden wording', () => {
		for (const text of [
			...Object.values(BLOCK_REWARD_STATUS_TEXT),
			BLOCK_REWARD_LOOKBACK_NOTE,
			BLOCK_REWARDS_PAUSED_TEXT,
			BLOCK_REWARDS_UNKNOWN_TEXT
		])
			expect(text).not.toMatch(/payout/i);
	});
});

describe('blockRewardFunding', () => {
	it('is paused when spendable is below the bonus', () => {
		expect(blockRewardFunding({ amount: 1_100n, minBalance: 100n }, 1_001n)).toBe('paused');
		expect(blockRewardFunding({ amount: 1_100, minBalance: 100 }, 1_001)).toBe('paused');
	});

	it('is funded when spendable equals or exceeds the bonus', () => {
		expect(blockRewardFunding({ amount: 1_100n, minBalance: 100n }, 1_000n)).toBe('funded');
		expect(blockRewardFunding({ amount: 5_000, minBalance: 100 }, 1_000)).toBe('funded');
	});

	it('is unknown without a sink or a bonus', () => {
		expect(blockRewardFunding(null, 1_000n)).toBe('unknown');
		expect(blockRewardFunding({ amount: 1_100n, minBalance: 100n }, null)).toBe('unknown');
	});
});
