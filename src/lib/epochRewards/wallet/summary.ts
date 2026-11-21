import type { WalletAccount } from '$lib/wallet/summary';
import { EPOCH_REWARDS_ENABLED } from '../config';

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
/** The epoch half of the wallet summary. */
export type WalletEpochSummary = {
	tooEarly: boolean;
	current: EpochSummary;
	history: EpochSummary[];
	earnedHistory: number | null;
	historyRatio: number | null;
};

/** The wallet's live and recent epoch figures, from the accounts the summary already counted. */
export function summarizeWalletEpochs({
	accounts,
	online,
	stakedOnline,
	contractSet,
	current,
	history
}: {
	/** Every account in view, each once. */
	accounts: WalletAccount[];
	/** The participating ones. */
	online: WalletAccount[];
	stakedOnline: number;
	contractSet: 'ready' | 'unavailable';
	current: WalletEpoch | null;
	history: WalletEpoch[];
}): WalletEpochSummary {
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
	return {
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

const WALLET_EPOCH_KEYS = [
	'tooEarly',
	'current',
	'history',
	'earnedHistory',
	'historyRatio'
] as const;

/**
 * The wallet summary with its epoch half, for the epoch cards; null when epoch rewards
 * are off. It is the summary itself, not a copy.
 */
export function walletEpochView<T extends Partial<WalletEpochSummary>>(
	summary: T
): (T & WalletEpochSummary) | null {
	if (!EPOCH_REWARDS_ENABLED || WALLET_EPOCH_KEYS.some((key) => summary[key] === undefined))
		return null;
	return summary as T & WalletEpochSummary;
}
