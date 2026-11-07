import type { DataState, Tone } from '$lib/ds/types';
import type { ContractDetails } from '$lib/types';
import { vestingStartTime } from './vesting';

export const IDLE_CONTRACT_MIN_BALANCE = 0.1;

/** Display amounts are VOI. ContractDetails retains the existing modal's microVOI units. */
export type WalletAccount = {
	address: string;
	contractId: number;
	balance: number;
	isParticipating: boolean;
	round: number;
	voteLastValid: number | null;
	lastVoteAt: string | null;
	lastBlock: number | null;
	lastBlockAt?: string | null;
	details?: ContractDetails | null;
};
export type WalletContract = WalletAccount & { details: ContractDetails | null };
export type WalletEpoch = {
	epoch: number;
	networkBlocks: number;
	onlineStake: number | null;
	pool: number;
	progress: number;
	blocks: Record<string, number>;
};
export type EpochSummary = {
	epoch: number;
	blocks: number | null;
	expected: number | null;
	ratio: number | null;
	reward: number | null;
	share: number | null;
	progress: number;
};
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
export type WalletSummary = {
	state: DataState;
	ownerLookup?: 'ok' | 'unavailable';
	contractCount: number;
	onlineContracts: number;
	onlineAccounts: number;
	stakedOnline: number;
	idleCount: number;
	idleBalance: number;
	keyDays: number | null;
	keyTone: Tone;
	oldestVoteAt: string | null;
	voteTone: Tone;
	lastBlock: number | null;
	lastBlockAt: string | null;
	healthTone: 'ok' | 'warn' | 'danger';
	tooEarly: boolean;
	current: EpochSummary;
	history: EpochSummary[];
	earnedHistory: number | null;
	historyRatio: number | null;
	contractSet: 'ready' | 'unavailable';
	contractsReady: boolean;
	withdrawable: number | null;
	unlocks: { date: string; amount: number; count: number }[];
	lockedByYear: { year: number; amount: number }[];
	holdings: WalletHoldings;
};

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
	const idle = contracts.filter(
		(account) => !account.isParticipating && account.balance > IDLE_CONTRACT_MIN_BALANCE
	);
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
	const votes = online
		.map((account) => account.lastVoteAt)
		.filter((date): date is string => date !== null && Number.isFinite(Date.parse(date)));
	const oldestVoteAt = votes.length ? votes.sort((a, b) => Date.parse(a) - Date.parse(b))[0] : null;
	const voteAge = oldestVoteAt ? (now - Date.parse(oldestVoteAt)) / 1000 : null;
	const voteTone: Tone =
		voteAge === null ? 'neutral' : voteAge > 3600 ? 'danger' : voteAge > 600 ? 'warn' : 'ok';
	const blocks = accounts.flatMap((account) =>
		account.lastBlock === null ? [] : [account.lastBlock]
	);

	function metrics(epoch: WalletEpoch): EpochSummary {
		if (contractSet === 'unavailable')
			return {
				epoch: epoch.epoch,
				progress: epoch.progress,
				blocks: null,
				expected: null,
				ratio: null,
				reward: null,
				share: null
			};
		const produced = accounts.reduce(
			(total, account) => total + (epoch.blocks[account.address] ?? 0),
			0
		);
		// DATA.md: network blocks × account stake ÷ eligible online stake. Historical account
		// snapshots do not contain stake: current online balances are an explicitly labelled approximation.
		const expected =
			epoch.onlineStake !== null && epoch.onlineStake > 0
				? (epoch.networkBlocks * stakedOnline) / epoch.onlineStake
				: null;
		const share = epoch.networkBlocks > 0 ? produced / epoch.networkBlocks : null;
		const early = online.length > 0 && epoch.progress < 1 && (expected === null || expected < 50);
		return {
			epoch: epoch.epoch,
			blocks: produced,
			expected,
			ratio: expected !== null && expected > 0 ? produced / expected : null,
			// Same so-far estimate as the live rewards table: pool / projected network blocks × produced.
			reward:
				!early && share !== null && epoch.progress > 0
					? (epoch.pool / Math.round(epoch.networkBlocks / epoch.progress)) * produced
					: null,
			share,
			progress: epoch.progress
		};
	}
	const completed = history
		.filter((epoch) => epoch.progress === 1 && (!current || epoch.epoch < current.epoch))
		.slice()
		.sort((a, b) => a.epoch - b.epoch)
		.slice(-12)
		.map(metrics);
	const expectedHistory = completed.reduce((total, epoch) => total + (epoch.expected ?? 0), 0);
	const currentMetrics = current
		? metrics(current)
		: {
				epoch: 0,
				blocks: null,
				expected: null,
				ratio: null,
				reward: null,
				share: null,
				progress: 0
			};
	const incompleteHealth =
		online.some((account) => account.voteLastValid === null) || votes.length !== online.length;
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
		onlineContracts: contracts.filter((account) => account.isParticipating).length,
		onlineAccounts: online.length,
		stakedOnline,
		idleCount: idle.length,
		idleBalance: idle.reduce((total, account) => total + account.balance, 0),
		keyDays: firstExpiry,
		keyTone,
		oldestVoteAt,
		voteTone,
		lastBlock: blocks.length ? Math.max(...blocks) : null,
		lastBlockAt: blocks.length
			? (accounts.find((account) => account.lastBlock === Math.max(...blocks))?.lastBlockAt ?? null)
			: null,
		healthTone:
			!online.length || keyTone === 'danger' || voteTone === 'danger'
				? 'danger'
				: keyTone === 'warn' || voteTone === 'warn' || idle.length > 0 || incompleteHealth
					? 'warn'
					: 'ok',
		tooEarly: online.length > 0 && currentMetrics.expected !== null && currentMetrics.expected < 50,
		current: currentMetrics,
		history: completed,
		earnedHistory:
			completed.length && completed.every((epoch) => epoch.reward !== null)
				? completed.reduce((total, epoch) => total + epoch.reward!, 0)
				: null,
		historyRatio:
			completed.length && completed.every((epoch) => epoch.expected !== null) && expectedHistory > 0
				? completed.reduce((total, epoch) => total + (epoch.blocks ?? 0), 0) / expectedHistory
				: null
	};
}
