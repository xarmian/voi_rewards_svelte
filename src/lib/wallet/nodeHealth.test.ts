import { describe, expect, it } from 'vitest';
import { accountEligibility, heartbeatHealth, heartbeatOverdueRounds } from './nodeHealth';
import { BLOCK_REWARD_STATUS_TEXT } from '$lib/rewards/blockRewardStatus';

const participation = {
	voteParticipationKey: new Uint8Array(32).fill(1),
	selectionParticipationKey: new Uint8Array(32).fill(2),
	stateProofKey: new Uint8Array(64).fill(3),
	voteFirstValid: 1n,
	voteLastValid: 1_000_000n,
	voteKeyDilution: 1000n
};
const account = (overrides: Record<string, unknown> = {}) => ({
	status: 'Online',
	incentiveEligible: false,
	amount: 100_000_000_000n,
	round: 1000n,
	participation,
	...overrides
});
const codes = (value: ReturnType<typeof accountEligibility>) =>
	value.status.reasons.map((reason) => reason.code);

describe('accountEligibility', () => {
	it('registers an online eligible account, with nothing to make eligible', () => {
		const result = accountEligibility('ADDR', account({ incentiveEligible: true }), null);
		expect(result).toEqual({ status: { registered: true, reasons: [] }, canMakeEligible: false });
	});

	it('offers the 2 VOI fee to an online account with live keys and no fee', () => {
		const result = accountEligibility('ADDR', account(), null);
		expect(codes(result)).toEqual(['not-opted-in']);
		expect(result.canMakeEligible).toBe(true);
	});

	it.each([
		['offline', account({ status: 'Offline', participation: undefined })],
		['suspended', account({ status: 'Offline' })],
		['expired keys', account({ participation: { ...participation, voteLastValid: 999n } })],
		[
			'keys ending within 1000 rounds',
			account({ participation: { ...participation, voteLastValid: 2000n } })
		]
	])('offers nothing to an %s account', (_, value) => {
		expect(accountEligibility('ADDR', value, null).canMakeEligible).toBe(false);
	});

	it('reports a suspended account', () => {
		expect(codes(accountEligibility('ADDR', account({ status: 'Offline' }), null))).toEqual([
			'suspended'
		]);
	});

	it('reads a capable contract online and eligible as registered', () => {
		const result = accountEligibility('APP', account({ incentiveEligible: true }), 'capable');
		expect(result.status).toEqual({ registered: true, reasons: [] });
		expect(result.canMakeEligible).toBe(false);
	});

	it('offers the fee to a capable contract online without it', () => {
		const result = accountEligibility('APP', account(), 'capable');
		expect(codes(result)).toEqual(['not-opted-in']);
		expect(result.canMakeEligible).toBe(true);
	});

	it.each(['incapable', 'unverified', 'checking'] as const)(
		'reads a %s contract as not registered with the contract reason and no offer',
		(incentive) => {
			const result = accountEligibility('APP', account({ incentiveEligible: true }), incentive);
			expect(result.status.registered).toBe(false);
			expect(result.status.reasons[0]).toEqual({
				code: 'contract',
				text: BLOCK_REWARD_STATUS_TEXT.contract
			});
			expect(accountEligibility('APP', account(), incentive).canMakeEligible).toBe(false);
		}
	);
});

describe('heartbeatOverdueRounds', () => {
	it('is half the absenteeism window: 20 × online stake ÷ account stake', () => {
		expect(heartbeatOverdueRounds(1e12, 1e15)).toBe(10_000);
	});

	it('never drops below the 1000-round floor', () => {
		expect(heartbeatOverdueRounds(1e14, 1e15)).toBe(1000);
	});

	it('is unknown without online stake or a positive balance', () => {
		expect(heartbeatOverdueRounds(1e12, null)).toBeNull();
		expect(heartbeatOverdueRounds(0, 1e15)).toBeNull();
	});
});

describe('heartbeatHealth', () => {
	const read = (overrides: Partial<Parameters<typeof heartbeatHealth>[0]> = {}) =>
		heartbeatHealth({
			round: 100_000,
			lastProposed: 95_000,
			lastHeartbeat: 98_000,
			amount: 1e12,
			onlineStake: 1e15,
			...overrides
		});

	it('takes last seen as the later of last proposed and last heartbeat', () => {
		const health = read();
		expect(health?.silentRounds).toBe(2000);
		expect(health?.lastProposedSeconds).toBeCloseTo(5000 * 2.8);
		expect(health?.lastHeartbeatSeconds).toBeCloseTo(2000 * 2.8);
		expect(read({ lastProposed: 99_000 })?.silentRounds).toBe(1000);
	});

	it('accepts bigint rounds and balances', () => {
		expect(
			heartbeatHealth({
				round: 100_000n,
				lastProposed: 95_000n,
				lastHeartbeat: undefined,
				amount: 1_000_000_000_000n,
				onlineStake: 1e15
			})
		).toMatchObject({ silentRounds: 5000, lastHeartbeatSeconds: null, overdue: false });
	});

	it('is null when the account has never been seen', () => {
		expect(read({ lastProposed: undefined, lastHeartbeat: undefined })).toBeNull();
		expect(read({ lastProposed: 0, lastHeartbeat: 0 })).toBeNull();
	});

	it('is not overdue at, or just under, half the window', () => {
		expect(read({ lastProposed: 90_000, lastHeartbeat: 90_000 })?.overdue).toBe(false);
		expect(read({ lastProposed: 90_001, lastHeartbeat: undefined })?.overdue).toBe(false);
	});

	it('is overdue just over half the window', () => {
		const health = read({ lastProposed: 89_999, lastHeartbeat: undefined });
		expect(health?.overdue).toBe(true);
		expect(health?.overdueAfter).toBe(10_000);
	});

	it('applies the floor to a large account', () => {
		expect(read({ amount: 1e14, lastProposed: 99_000, lastHeartbeat: undefined })?.overdue).toBe(
			false
		);
		expect(read({ amount: 1e14, lastProposed: 98_999, lastHeartbeat: undefined })?.overdue).toBe(
			true
		);
	});

	it('shows the ages with no verdict when online stake is unavailable', () => {
		const health = read({ onlineStake: null, lastProposed: 1, lastHeartbeat: undefined });
		expect(health).toMatchObject({ overdue: null, overdueAfter: null, silentRounds: 99_999 });
		expect(health?.lastProposedSeconds).toBeCloseTo(99_999 * 2.8);
	});
});
