import type { ContractDetails } from '$lib/types';
import type { WalletContract } from './summary';

export const scheduleNow = Date.parse('2026-12-31T12:00:00Z');
export function contractFixture(id = 1, changes: Partial<ContractDetails> = {}): WalletContract {
	const details: ContractDetails = {
		contractId: id,
		contractAddress: `CONTRACT${id}`,
		owner: 'OWNER',
		balance: 12e6,
		isParticipating: true,
		lockupPeriod: 0,
		vestingPeriod: 4 * 86400,
		totalAmount: '8000000',
		fundingTime: Date.parse('2026-12-31T00:00:00Z') / 1000,
		nextVestingDate: new Date('2027-01-02T00:00:00Z'),
		lockedBalance: 8e6,
		availableForWithdrawal: 3.9e6,
		isFullyVested: false,
		nextVestingAmount: 2e6,
		remainingVestingAmount: 8e6,
		distributionCount: 4,
		distributionSeconds: 86400,
		lockupDelay: 0,
		vestingDelay: 2,
		periodSeconds: 86400,
		period: 1,
		accountInfo: { round: 100, status: 'Online' },
		...changes
	};
	return {
		address: details.contractAddress,
		contractId: id,
		balance: details.balance / 1e6,
		isParticipating: details.isParticipating,
		round: 100,
		voteLastValid: null,
		lastVoteAt: null,
		lastBlock: null,
		details
	};
}
