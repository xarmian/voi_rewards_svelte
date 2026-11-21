import { get } from 'svelte/store';
import { vestingStartTime } from './vesting';
import { algodClient } from '$lib/utils/algod';
import { decodeLockContractState } from '$lib/chain/lockContract';
import { globalStateEntries } from '$lib/chain/algodShapes';
import { getAccountInfo, getSupplyInfo, requireAccountInfo } from '$lib/stores/accounts';
import { contractIncentiveOf } from '$lib/chain/keyreg';
import { getLockContractsByOwner } from '$lib/services/lockvest';
import { fetchFungibleTokens } from '$lib/services/accounts';
import { fetchVoiPrice, voiPrice } from '$lib/stores/price';
import { EPOCH_REWARDS_ENABLED, type WalletEpoch } from '$lib/epochRewards';
import { startWalletEpochs } from '$lib/epochRewards/client';
import { finite } from '$lib/home/headline';
import type { Account, ContractDetails } from '$lib/types';
import type { DataState } from '$lib/ds/types';
import type { WalletAccount, WalletContract, TokenValues } from './summary';
import { bounded } from './read';
import { accountEligibility, heartbeatHealth } from './nodeHealth';

export type LegacyAccount = Account & { contractId: number };
export type WalletSnapshot = {
	owner: WalletAccount;
	contracts: WalletContract[];
	contractSet: 'ready' | 'unavailable';
	primary: LegacyAccount;
	children: LegacyAccount[];
	/** null when epoch rewards are off. */
	current: WalletEpoch | null;
	history: WalletEpoch[];
	historyState: DataState;
	tokens: TokenValues;
	price: number | null;
	asOf: string;
};

// These display details intentionally use LockVestComponent's existing reads and calculations.
// The existing modals receive the same ContractDetails shape and microVOI units.
export async function readContract(
	account: WalletAccount,
	force: boolean
): Promise<ContractDetails> {
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

	// The program was read above; checking its hash makes no further request.
	const incentive = await contractIncentiveOf(async () => appInfo.params?.approvalProgram);

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
		eligibility: accountEligibility(account.address, accountInfo, incentive),
		accountInfo: {
			round: Number(accountInfo.round),
			status: accountInfo.status,
			incentiveEligible: accountInfo.incentiveEligible === true,
			amount: currentBalance,
			participation: accountInfo.participation
				? { voteLastValid: Number(accountInfo.participation.voteLastValid) }
				: undefined
		}
	};
}

export { bounded };

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
	const epochs = EPOCH_REWARDS_ENABLED ? startWalletEpochs(force) : null;
	const priceRequest = bounded(fetchVoiPrice(force)).catch(() => undefined);
	const [supply, locks, dates] = await Promise.all([
		bounded(getSupplyInfo()),
		bounded(getLockContractsByOwner(ownerAddress)).catch((error) => {
			console.error('Lockvest lookup failed:', error);
			return null;
		}),
		epochs?.ranges() ?? null
	]);
	if (!supply || (dates !== null && !dates.length))
		throw new Error('Wallet network data unavailable');
	const stake = (supply['online-money'] - supply['blacklisted-money']) / 1e6;
	// Heartbeat staleness needs total online stake: algod's onlineMoney, already in the supply read.
	const onlineStake = finite(supply['online-money']);
	async function readAccount(address: string, contractId = 0): Promise<WalletAccount> {
		const account = await bounded(getAccountInfo(address, force));
		if (!account) throw new Error('Account data unavailable');
		const balance = Number(account.amount) / 1e6;
		if (!Number.isFinite(balance)) throw new Error('Account balance unavailable');
		return {
			address,
			contractId,
			balance,
			minBalance: account.minBalance == null ? null : finite(Number(account.minBalance) / 1e6),
			isParticipating: account.status === 'Online',
			round: supply!['current-round'],
			voteLastValid: account.participation
				? finite(Number(account.participation.voteLastValid))
				: null,
			health: {
				// A contract's eligibility needs its program; it comes from readContract below.
				eligibility: contractId ? null : accountEligibility(address, account, null),
				heartbeat: heartbeatHealth({
					round: account.round ?? supply!['current-round'],
					lastProposed: account.lastProposed,
					lastHeartbeat: account.lastHeartbeat,
					amount: account.amount,
					onlineStake,
					eligible: account.incentiveEligible === true
				})
			}
		};
	}
	const [owner, children, live] = await Promise.all([
		readAccount(ownerAddress),
		Promise.all((locks ?? []).map((lock) => readAccount(lock.contractAddress, lock.contractId))),
		dates && epochs ? epochs.live(dates, stake) : null
	]);
	const contracts = await Promise.all(
		children.map(async (account): Promise<WalletContract> => {
			const details = await bounded(readContract(account, force)).catch(() => null);
			return {
				...account,
				health: { heartbeat: null, ...account.health, eligibility: details?.eligibility ?? null },
				details
			};
		})
	);
	const viewOwner = pageAddress === ownerAddress ? owner : null;
	const viewContracts =
		pageAddress === ownerAddress
			? contracts
			: contracts.filter((contract) => contract.address === pageAddress);
	if (!viewOwner && !viewContracts.length) throw new Error('Contract account unavailable');
	const history = dates && epochs ? await epochs.history(dates) : null;
	await priceRequest;
	const quote = get(voiPrice);
	const price = !quote.error && quote.price > 0 ? quote.price : null;
	const tokens = await readTokens(pageAddress, price);
	return {
		owner,
		contracts,
		contractSet: locks === null ? 'unavailable' : 'ready',
		primary: legacy(owner, stake, live?.value.pool ?? 0),
		children: children
			.map((account) => legacy(account, stake, live?.value.pool ?? 0))
			.sort((a, b) => b.balance - a.balance),
		current: live?.value ?? null,
		history: history?.history ?? [],
		historyState: history?.state ?? 'ready',
		tokens,
		price,
		// With epoch rewards off there are no epoch rows to date the data: it is as of this load.
		asOf: live?.asOf ?? new Date().toISOString()
	};
}
