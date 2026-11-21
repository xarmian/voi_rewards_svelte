import type { DataState, Tone } from '$lib/ds/types';
import type { ContractDetails } from '$lib/types';
import { vestingStartTime } from './vesting';
import type { AccountHealth, Eligibility, Heartbeat } from './nodeHealth';
import {
	EPOCH_REWARDS_ENABLED,
	type WalletEpoch,
	type WalletEpochSummary
} from '$lib/epochRewards';
import { summarizeWalletEpochs } from '$lib/epochRewards/client';

export type { EpochSummary, WalletEpoch } from '$lib/epochRewards';

export const BASE_MIN_BALANCE_VOI = 0.1;
/**
 * Stake above the minimum balance below which an offline contract counts as empty. Under 1 VOI
 * an account's share of online stake is so small it would not expect a block, so registering a
 * key could not earn anything: it is not a staking contract left idle.
 */
export const MIN_STAKE_MICROVOI = 1_000_000;

/** Display amounts are VOI. ContractDetails retains the existing modal's microVOI units. */
export type WalletAccount = {
	address: string;
	contractId: number;
	balance: number;
	/** Account minimum balance in VOI, from algod min-balance. */
	minBalance?: number | null;
	isParticipating: boolean;
	round: number;
	voteLastValid: number | null;
	/** Real-time block reward eligibility and heartbeat, from the algod account record. */
	health?: AccountHealth | null;
	details?: ContractDetails | null;
};

export function isEmptyContract(account: WalletAccount): boolean {
	const minBalance =
		typeof account.minBalance === 'number' && Number.isFinite(account.minBalance)
			? account.minBalance
			: BASE_MIN_BALANCE_VOI;
	return (
		account.isParticipating === false &&
		Math.round(account.balance * 1e6) - Math.round(minBalance * 1e6) < MIN_STAKE_MICROVOI
	);
}

export type WalletContract = WalletAccount & { details: ContractDetails | null };
export type TokenValues = {
	state: DataState;
	lp: number;
	other: number;
	lpCount: number;
	tokenCount: number;
};
export type WalletHoldings = TokenValues & {
	locked: number;
	liquid: number;
	/** False on a contract route: no owner is in view, so `liquid` is a placeholder, not a balance. */
	liquidKnown: boolean;
	total: number | null;
	usd: number | null;
};
export type EligibilityRow = {
	address: string;
	/** null for the owner account. */
	contractId: number | null;
	eligibility: Eligibility | null;
};
export type WalletSummaryBase = {
	state: DataState;
	ownerLookup?: 'ok' | 'unavailable';
	contractCount: number;
	emptyContracts: number;
	healthContractCount: number;
	onlineContracts: number;
	onlineAccounts: number;
	stakedOnline: number;
	idleCount: number;
	idleBalance: number;
	keyDays: number | null;
	keyTone: Tone;
	heartbeat: {
		tone: Tone;
		/**
		 * The account whose ages the card shows: when any is overdue, the most overdue against its own
		 * window; otherwise the online account silent longest.
		 */
		shown: Heartbeat | null;
		overdueCount: number;
		/** Online accounts with no proposal or heartbeat on record. */
		unknownCount: number;
	};
	suspendedCount: number;
	/** The owner, then each online or suspended contract. */
	eligibilityRows: EligibilityRow[];
	healthTone: 'ok' | 'warn' | 'danger';
	contractSet: 'ready' | 'unavailable';
	contractsReady: boolean;
	withdrawable: number | null;
	unlocks: { date: string; amount: number; count: number }[];
	lockedByYear: { year: number; amount: number }[];
	holdings: WalletHoldings;
};
/** The epoch fields are absent when epoch rewards are off. */
export type WalletSummary = WalletSummaryBase & Partial<WalletEpochSummary>;

export function summarizeWallet({
	owner,
	contracts,
	current,
	history,
	state,
	now,
	tokens,
	contractSet = 'ready',
	ownerLookup = 'ok',
	price = null
}: {
	owner: WalletAccount | null;
	contracts: WalletAccount[];
	current: WalletEpoch | null;
	history: WalletEpoch[];
	state: DataState;
	now: number;
	tokens?: TokenValues;
	price?: number | null;
	contractSet?: 'ready' | 'unavailable';
	ownerLookup?: 'ok' | 'unavailable';
}): WalletSummary {
	// A contract route can be supplied as the primary account too: never count it twice.
	const accounts = [
		...new Map([...(owner ? [owner] : []), ...contracts].map((a) => [a.address, a])).values()
	];
	const online = accounts.filter((account) => account.isParticipating);
	const stakedOnline = online.reduce((total, account) => total + account.balance, 0);
	const idle = contracts.filter((account) => !account.isParticipating && !isEmptyContract(account));
	const emptyContracts = contracts.filter(isEmptyContract).length;
	const keyDays = accounts
		.filter((account) => account.voteLastValid !== null && Number.isFinite(account.voteLastValid))
		.map((account) => ((account.voteLastValid! - account.round) * 2.8) / 86400);
	const firstExpiry = keyDays.length ? Math.min(...keyDays) : null;
	const keyTone: Tone =
		firstExpiry === null
			? 'neutral'
			: firstExpiry < 7
				? 'danger'
				: firstExpiry < 30
					? 'warn'
					: 'ok';
	const heartbeats = online.flatMap((account) =>
		account.health?.heartbeat ? [account.health.heartbeat] : []
	);
	const oldestHeartbeat = heartbeats.reduce<Heartbeat | null>(
		(oldest, beat) => (oldest === null || beat.silentRounds > oldest.silentRounds ? beat : oldest),
		null
	);
	const overdue = heartbeats.filter((beat) => beat.overdue === true);
	const overdueCount = overdue.length;
	// Each account's window scales with 1/stake, so the longest silence need not be the overdue one.
	const lateness = (beat: Heartbeat) => beat.silentRounds / (beat.overdueAfter ?? Infinity);
	const shownHeartbeat = overdueCount
		? overdue.reduce((most, beat) => (lateness(beat) > lateness(most) ? beat : most))
		: oldestHeartbeat;
	const heartbeatTone: Tone =
		oldestHeartbeat === null
			? 'neutral'
			: overdueCount > 0
				? 'warn'
				: heartbeats.some((beat) => beat.overdue === null)
					? 'neutral'
					: 'ok';
	const suspendedOf = (account: WalletAccount) =>
		!!account.health?.eligibility?.status.reasons.some((reason) => reason.code === 'suspended');
	const suspendedCount = accounts.filter(suspendedOf).length;
	const ownerRow = owner && !contracts.some((contract) => contract.address === owner.address);
	const eligibilityRows: EligibilityRow[] = [
		...(owner && ownerRow
			? [
					{
						address: owner.address,
						contractId: null,
						eligibility: owner.health?.eligibility ?? null
					}
				]
			: []),
		// Keyed by address in the card, so a contract listed twice appears once.
		...[...new Map(contracts.map((account) => [account.address, account])).values()]
			.filter((account) => account.isParticipating || suspendedOf(account))
			.map((account) => ({
				address: account.address,
				contractId: account.contractId,
				eligibility: account.health?.eligibility ?? null
			}))
	];

	const incompleteHealth =
		online.some((account) => account.voteLastValid === null) || heartbeats.length !== online.length;
	const contractsReady =
		ownerLookup === 'ok' &&
		contractSet === 'ready' &&
		contracts.every((contract) => contract.details !== null && contract.details !== undefined);
	const unlocks = new Map<string, { date: string; amount: number; count: number }>();
	const years = new Map<number, number>();
	let locked = 0;
	let withdrawable = 0;
	for (const account of contracts) {
		const detail = account.details;
		if (!detail) continue;
		const lockedAmount = Math.min(account.balance, detail.lockedBalance / 1e6);
		locked += lockedAmount;
		withdrawable += detail.availableForWithdrawal / 1e6;
		if (detail.nextVestingDate && detail.nextVestingAmount > 0) {
			const date = detail.nextVestingDate.toISOString().slice(0, 10);
			const entry = unlocks.get(date) ?? { date, amount: 0, count: 0 };
			entry.amount += detail.nextVestingAmount / 1e6;
			entry.count++;
			unlocks.set(date, entry);
		}
		if (detail.fundingTime && detail.lockedBalance > 0) {
			// Same rule as the loader: until funding + lockup + delay has passed, vesting starts then
			// (the date shown as the next unlock); the zero-lockup shortcut to funding time applies after.
			const firstWindowEnd =
				detail.fundingTime +
				detail.lockupPeriod +
				Math.max(1, detail.vestingDelay) * detail.periodSeconds;
			const start =
				now / 1000 < firstWindowEnd
					? firstWindowEnd
					: vestingStartTime(
							detail.fundingTime,
							detail.lockupPeriod,
							detail.vestingDelay,
							detail.periodSeconds
						);
			const year = new Date(start * 1000).getUTCFullYear();
			years.set(year, (years.get(year) ?? 0) + lockedAmount);
		}
	}
	const liquid =
		owner && !contracts.some((contract) => contract.address === owner.address) ? owner.balance : 0;
	const other =
		(tokens?.other ?? 0) +
		contracts.reduce((total, account) => total + account.balance, 0) -
		locked;
	const holdingsReady = contractsReady && tokens?.state === 'ready';
	const total = holdingsReady ? liquid + locked + other + tokens.lp : null;
	return {
		ownerLookup,
		contractSet,
		contractsReady,
		withdrawable: contractsReady ? withdrawable : null,
		unlocks: [...unlocks.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4),
		lockedByYear: [...years].sort(([a], [b]) => a - b).map(([year, amount]) => ({ year, amount })),
		holdings: {
			state: state === 'loading' ? 'loading' : holdingsReady ? 'ready' : 'error',
			locked,
			liquid,
			liquidKnown: owner !== null && ownerLookup === 'ok',
			lp: tokens?.lp ?? 0,
			other,
			total,
			usd: total !== null && price !== null ? total * price : null,
			lpCount: tokens?.lpCount ?? 0,
			tokenCount: tokens?.tokenCount ?? 0
		},
		state,
		contractCount: contracts.length,
		emptyContracts,
		healthContractCount: contracts.length - emptyContracts,
		onlineContracts: contracts.filter((account) => account.isParticipating).length,
		onlineAccounts: online.length,
		stakedOnline,
		idleCount: idle.length,
		idleBalance: idle.reduce((total, account) => total + account.balance, 0),
		keyDays: firstExpiry,
		keyTone,
		heartbeat: {
			tone: heartbeatTone,
			shown: shownHeartbeat,
			overdueCount,
			unknownCount: online.length - heartbeats.length
		},
		suspendedCount,
		eligibilityRows,
		healthTone:
			!online.length || keyTone === 'danger' || suspendedCount > 0
				? 'danger'
				: keyTone === 'warn' || heartbeatTone === 'warn' || idle.length > 0 || incompleteHealth
					? 'warn'
					: 'ok',
		...(EPOCH_REWARDS_ENABLED
			? summarizeWalletEpochs({ accounts, online, stakedOnline, contractSet, current, history })
			: {})
	};
}
