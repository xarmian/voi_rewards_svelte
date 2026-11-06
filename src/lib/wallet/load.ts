import { get } from 'svelte/store';
import { vestingStartTime } from './vesting';
import { algodClient } from '$lib/utils/algod';
import { decodeLockContractState } from '$lib/chain/lockContract';
import { globalStateEntries } from '$lib/chain/algodShapes';
import {
	getAccountInfo,
	getConsensusInfo,
	getSupplyInfo,
	requireAccountInfo
} from '$lib/stores/accounts';
import { getLockContractsByOwner } from '$lib/services/lockvest';
import { fetchFungibleTokens } from '$lib/services/accounts';
import { fetchVoiPrice, voiPrice } from '$lib/stores/price';
import { dataTable, type DateRange } from '../../stores/dataTable';
import { getTokensByEpoch } from '$lib/utils';
import { epochRange } from '$lib/epochs';
import { blocksForEpoch, finite } from '$lib/home/headline';
import type { EpochResponse } from '$lib/home/rewards';
import type { Account, ContractDetails } from '$lib/types';
import type { DataState } from '$lib/ds/types';
import type { WalletAccount, WalletContract, WalletEpoch, TokenValues } from './summary';

export type LegacyAccount = Account & { contractId: number };
export type WalletSnapshot = {
	owner: WalletAccount;
	contracts: WalletContract[];
	contractSet: 'ready' | 'unavailable';
	primary: LegacyAccount;
	children: LegacyAccount[];
	current: WalletEpoch;
	history: WalletEpoch[];
	historyState: DataState;
	tokens: TokenValues;
	price: number | null;
	asOf: string;
};

// These display details intentionally use LockVestComponent's existing reads and calculations.
// The existing modals receive the same ContractDetails shape and microVOI units.
async function readContract(account: WalletAccount, force: boolean): Promise<ContractDetails> {
	// Get the application info using algodClient
	const appInfo = await algodClient.getApplicationByID(account.contractId).do();
	const accountInfo = await requireAccountInfo(account.address, { force });
	const currentBalance = Number(accountInfo.amount);

	// Decode the global state
	const decodedState = decodeLockContractState(
		globalStateEntries(appInfo.params?.globalState),
		account.address
	);

	// Calculate periods and balances
	const now = Math.floor(Date.now() / 1000);
	const fundingTime = decodedState.global_funding ? Number(decodedState.global_funding) : null;

	let nextVestingDate = null;
	let lockedBalance = 0;
	let isFullyVested = false;
	let nextVestingAmount = 0;
	let remainingVestingAmount = 0;
	let availableForWithdrawal = 0;

	if (fundingTime) {
		// Calculate lockup components
		const lockupDelay =
			Number(decodedState.global_lockup_delay ?? 0) *
			Number(decodedState.global_period ?? 0) *
			Number(decodedState.global_period_seconds ?? 0);

		const vestingDelay =
			Math.max(1, Number(decodedState.global_vesting_delay ?? 0)) *
			Number(decodedState.global_period_seconds ?? 0);

		const lockupPeriod = lockupDelay;
		const fullVestingTime = lockupPeriod + vestingDelay;
		const elapsedTime = now - fundingTime;
		const totalBalance = Number(decodedState.global_total ?? '0');

		if (elapsedTime < lockupPeriod) {
			nextVestingDate = new Date((fundingTime + fullVestingTime) * 1000);
			lockedBalance = totalBalance;
			isFullyVested = false;
			nextVestingAmount = totalBalance / Number(decodedState.global_distribution_count ?? 1);
			remainingVestingAmount = totalBalance;
		} else if (elapsedTime >= fullVestingTime) {
			// If there's no lockup period, we start counting from funding time
			const start = vestingStartTime(
				fundingTime,
				lockupPeriod,
				Number(decodedState.global_vesting_delay ?? 0),
				Number(decodedState.global_period_seconds ?? 0)
			);
			const vestingElapsedTime = now - start;
			const periodsPassed = Math.floor(
				vestingElapsedTime / Number(decodedState.global_distribution_seconds ?? 1)
			);
			const periodsRemaining = Number(decodedState.global_distribution_count ?? 0) - periodsPassed;

			if (periodsPassed >= Number(decodedState.global_distribution_count ?? 0)) {
				nextVestingDate = null;
				lockedBalance = 0;
				isFullyVested = true;
				nextVestingAmount = 0;
				remainingVestingAmount = 0;
			} else {
				const nextVestingTime =
					start + (periodsPassed + 1) * Number(decodedState.global_distribution_seconds ?? 0);
				nextVestingDate = new Date(nextVestingTime * 1000);

				const amountPerPeriod = totalBalance / Number(decodedState.global_distribution_count ?? 1);
				lockedBalance = amountPerPeriod * periodsRemaining;
				remainingVestingAmount = lockedBalance;
				nextVestingAmount = amountPerPeriod;
				isFullyVested = false;
			}
		} else {
			const vestingStartTime = fundingTime + fullVestingTime;
			nextVestingDate = new Date(vestingStartTime * 1000);
			lockedBalance = totalBalance;
			isFullyVested = false;
			nextVestingAmount = totalBalance / Number(decodedState.global_distribution_count ?? 1);
			remainingVestingAmount = totalBalance;
		}

		// Calculate available withdrawal amount considering minimum balance
		const minimumBalance = Number(accountInfo.minBalance);
		availableForWithdrawal = Math.max(0, currentBalance - lockedBalance - minimumBalance);
	}

	// Get consensus data
	const consensusInfo = await getConsensusInfo(account.address, force);

	return {
		contractId: account.contractId,
		contractAddress: account.address,
		owner: decodedState.global_owner ?? '',
		balance: currentBalance,
		isParticipating: accountInfo.status === 'Online',
		lockupPeriod:
			Number(decodedState.global_lockup_delay ?? 0) *
			Number(decodedState.global_period ?? 0) *
			Number(decodedState.global_period_seconds ?? 0),
		vestingPeriod:
			Number(decodedState.global_distribution_count ?? 0) *
			Number(decodedState.global_distribution_seconds ?? 0),
		totalAmount: decodedState.global_total ?? '0',
		fundingTime,
		nextVestingDate,
		lockedBalance,
		availableForWithdrawal,
		isFullyVested,
		nextVestingAmount,
		remainingVestingAmount,
		distributionCount: Number(decodedState.global_distribution_count ?? 0),
		distributionSeconds: Number(decodedState.global_distribution_seconds ?? 0),
		lockupDelay: Number(decodedState.global_lockup_delay ?? 0),
		vestingDelay: Number(decodedState.global_vesting_delay ?? 0),
		periodSeconds: Number(decodedState.global_period_seconds ?? 0),
		period: Number(decodedState.global_period ?? 0),
		consensusDetails: consensusInfo,
		accountInfo: {
			round: Number(accountInfo.round),
			status: accountInfo.status,
			participation: accountInfo.participation
				? { voteLastValid: Number(accountInfo.participation.voteLastValid) }
				: undefined
		}
	};
}

async function bounded<T>(request: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			request,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error('Wallet data request timed out')), 15000);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}

function legacy(account: WalletAccount, stake: number, pool: number): LegacyAccount {
	const share = stake > 0 ? account.balance / stake : 0;
	const dailyBlocks = (86400 / 2.8) * share;
	return {
		...account,
		blocksProduced24h: 0,
		expectedBlocksPerDay: dailyBlocks,
		expectedBlocksPerWeek: dailyBlocks * 7,
		expectedBlocksPerMonth: dailyBlocks * 30.44,
		estimatedRewardsPerDay: (share * pool) / 7,
		estimatedRewardsPerWeek: share * pool,
		estimatedRewardsPerMonth: (share * pool * 30.44) / 7
	};
}

async function readEpoch(
	date: DateRange,
	stake: number | null,
	force: boolean
): Promise<{ value: WalletEpoch; asOf: string }> {
	const [raw, pool] = await Promise.all([
		bounded(dataTable.fetchData(date.id, force)),
		getTokensByEpoch(date.epoch)
	]);
	const rows = raw as EpochResponse;
	if (!Array.isArray(rows?.data) || !Number.isFinite(blocksForEpoch(date.epoch, rows)))
		throw new Error('Epoch rows unavailable');
	const blocks: Record<string, number> = {};
	for (const row of rows.data) {
		const count = finite(row.block_count);
		if (count === null || count < 0 || !row.proposer) throw new Error('Invalid proposer row');
		blocks[row.proposer] = count;
	}
	const range = epochRange(date.epoch);
	const asOf = rows.max_timestamp;
	if (!asOf || !Number.isFinite(Date.parse(asOf))) throw new Error('Epoch timestamp unavailable');
	const progress = Math.max(
		0,
		Math.min(1, (Date.parse(asOf) - range.start.getTime()) / (7 * 86400000))
	);
	return {
		value: {
			epoch: date.epoch,
			networkBlocks: blocksForEpoch(date.epoch, rows),
			onlineStake: stake,
			pool,
			progress,
			blocks
		},
		asOf
	};
}

async function readTokens(address: string, price: number | null): Promise<TokenValues> {
	const empty: TokenValues = { state: 'error', lp: 0, other: 0, lpCount: 0, tokenCount: 0 };
	try {
		const { tokens, partial } = await bounded(fetchFungibleTokens(address, price ?? 0));
		if (
			partial ||
			(price === null && tokens.length > 0) ||
			tokens.some((token) => !Number.isFinite(token.value) || token.value < 0)
		)
			return empty;
		const lpTokens = tokens.filter((token) => token.poolInfo);
		const otherTokens = tokens.filter((token) => !token.poolInfo);
		return {
			state: 'ready',
			lp: lpTokens.reduce((sum, token) => sum + token.value, 0),
			other: otherTokens.reduce((sum, token) => sum + token.value, 0),
			lpCount: lpTokens.length,
			tokenCount: otherTokens.length
		};
	} catch {
		return empty;
	}
}

/** Browser caller only. No signing, selection writes, or server-side store mutation. */
export async function loadWallet(
	ownerAddress: string,
	pageAddress: string,
	force = false
): Promise<WalletSnapshot> {
	const epochDetails = bounded(
		fetch('/api/epochs').then(async (response) => {
			if (!response.ok) throw new Error('Epoch stake unavailable');
			const data: { epochs: { epoch_number: number; eligible_online_stake: number }[] } =
				await response.json();
			if (!Array.isArray(data.epochs)) throw new Error('Epoch stake unavailable');
			return data.epochs;
		})
	).catch(() => []);
	const priceRequest = bounded(fetchVoiPrice(force)).catch(() => undefined);
	const [supply, locks, dates] = await Promise.all([
		bounded(getSupplyInfo()),
		bounded(getLockContractsByOwner(ownerAddress)).catch((error) => {
			console.error('Lockvest lookup failed:', error);
			return null;
		}),
		bounded(dataTable.fetchDateRanges(force))
	]);
	if (!supply || !dates.length) throw new Error('Wallet network data unavailable');
	const stake = (supply['online-money'] - supply['blacklisted-money']) / 1e6;
	async function readAccount(address: string, contractId = 0): Promise<WalletAccount> {
		const [account, consensus] = await Promise.all([
			bounded(getAccountInfo(address, force)),
			bounded(getConsensusInfo(address, force)).catch(() => undefined)
		]);
		if (!account) throw new Error('Account data unavailable');
		const balance = Number(account.amount) / 1e6;
		if (!Number.isFinite(balance)) throw new Error('Account balance unavailable');
		return {
			address,
			contractId,
			balance,
			isParticipating: account.status === 'Online',
			round: supply!['current-round'],
			voteLastValid: account.participation
				? finite(Number(account.participation.voteLastValid))
				: null,
			lastVoteAt: consensus?.last_vote_timestamp ?? null,
			lastBlock: consensus?.last_block ? consensus.last_block : null,
			lastBlockAt:
				consensus &&
				'last_block_timestamp' in consensus &&
				typeof consensus.last_block_timestamp === 'string'
					? consensus.last_block_timestamp
					: null
		};
	}
	const latest = dates[dates.length - 1];
	const [owner, children, live, epochs] = await Promise.all([
		readAccount(ownerAddress),
		Promise.all((locks ?? []).map((lock) => readAccount(lock.contractAddress, lock.contractId))),
		readEpoch(latest, stake, force),
		epochDetails
	]);
	const contracts = await Promise.all(
		children.map(
			async (account): Promise<WalletContract> => ({
				...account,
				details: await bounded(readContract(account, force)).catch(() => null)
			})
		)
	);
	const viewOwner = pageAddress === ownerAddress ? owner : null;
	const viewContracts =
		pageAddress === ownerAddress
			? contracts
			: contracts.filter((contract) => contract.address === pageAddress);
	if (!viewOwner && !viewContracts.length) throw new Error('Contract account unavailable');
	const historical = await Promise.allSettled(
		dates.slice(-13, -1).map(async (date) => {
			const stake = finite(
				epochs.find((epoch) => epoch.epoch_number === date.epoch)?.eligible_online_stake
			);
			if (stake === null || stake <= 0) throw new Error('Historical stake unavailable');
			// /api/epochs eligible_online_stake is already VOI, like account balances.
			// Refresh only bypasses the live epoch cache; completed rows remain cached.
			const result = await readEpoch(date, stake, false);
			// The date range has ended; snapshots can stop before the final instant if there was no block then.
			return { ...result.value, progress: 1 };
		})
	);
	await priceRequest;
	const quote = get(voiPrice);
	const price = !quote.error && quote.price > 0 ? quote.price : null;
	const tokens = await readTokens(pageAddress, price);
	return {
		owner,
		contracts,
		contractSet: locks === null ? 'unavailable' : 'ready',
		primary: legacy(owner, stake, live.value.pool),
		children: children
			.map((account) => legacy(account, stake, live.value.pool))
			.sort((a, b) => b.balance - a.balance),
		current: live.value,
		history: historical.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
		historyState: historical.some((result) => result.status === 'rejected') ? 'error' : 'ready',
		tokens,
		price,
		asOf: live.asOf
	};
}
