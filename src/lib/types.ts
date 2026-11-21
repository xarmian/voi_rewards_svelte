import type { Eligibility } from '$lib/wallet/nodeHealth';

export interface PeerRecord {
	id: number;
	host_name: string;
	peer_date: string;
	peer_count: number;
	created_at: string;
	updated_at: string;
}

export interface Account {
	address: string;
	isParticipating: boolean;
	balance: number;
	blocksProduced24h: number;
	expectedBlocksPerDay: number;
	expectedBlocksPerWeek: number;
	expectedBlocksPerMonth: number;
	estimatedRewardsPerDay: number;
	estimatedRewardsPerWeek: number;
	estimatedRewardsPerMonth: number;
}

export interface ContractDetails {
	contractId: number;
	contractAddress: string;
	owner: string;
	balance: number;
	isParticipating: boolean;
	lockupPeriod: number;
	vestingPeriod: number;
	totalAmount: string;
	fundingTime: number | null;
	nextVestingDate: Date | null;
	lockedBalance: number;
	availableForWithdrawal: number;
	isFullyVested: boolean;
	nextVestingAmount: number;
	remainingVestingAmount: number;
	distributionCount: number;
	distributionSeconds: number;
	lockupDelay: number;
	vestingDelay: number;
	periodSeconds: number;
	period: number;
	global_funding?: string;
	global_lockup_delay?: number;
	global_period?: number;
	global_period_seconds?: number;
	global_vesting_delay?: number;
	global_total?: string;
	global_distribution_count?: number;
	global_distribution_seconds?: number;
	global_owner?: string;
	consensusInfo?: {
		'vote-first-valid': number;
		'vote-last-valid': number;
		'vote-key-dilution': number;
		'selection-participation-key': string;
		'vote-participation-key': string;
		'state-proof-key': string;
	};
	participation?: {
		'vote-first-valid': number;
		'vote-last-valid': number;
		'vote-key-dilution': number;
		'selection-participation-key': string;
		'vote-participation-key': string;
		'state-proof-key': string;
	};
	accountInfo?: {
		round: number;
		status: string;
		incentiveEligible?: boolean;
		/** microVOI. */
		amount?: number;
		participation?: { voteLastValid: number };
	};
	/** Real-time block reward status from the account and program already read; null if unread. */
	eligibility?: Eligibility | null;
}
