import { finite } from '$lib/home/headline';
import { calculateEpochRewards } from './calculateEpochRewards';
import { REWARDS_ADDRESSES } from '$lib/chain/rewardSenders';
import { getSupplyInfo } from '$lib/stores/accounts';
import { getTokensByEpoch } from '$lib/utils';
import { dataTable } from '../dataTable';
import type { WalletAccount } from '$lib/wallet/summary';
import { boundedRead, type Source } from '$lib/wallet/read';
import { count, json, record, type RewardAccount } from '$lib/wallet/rewards';
import type { Tone } from '$lib/ds/types';
import { epochRange } from '../calendar';
import { blocksForEpoch } from '../headline';
import { epochHistory, walletSummaryUrl } from '../source';
import { summarizeWalletEpochs } from './summary';

export type RewardEpoch = {
	epoch: number;
	blocks: number;
	networkBlocks: number;
	estimate: number | null;
	current: boolean;
	progress?: number;
	pool?: number;
	/** A completed epoch with no published snapshot: blocks are unknown, not zero. */
	missing?: true;
};
export type Payment = { txid: string; timestamp: string; amount: number };
export type Payouts = { payments: Payment[]; complete: boolean };
export type EligibleStake = { epoch_number: number; eligible_online_stake: number };
/** The rewards tab's epoch sources. */
export type EpochRewardsState = {
	epochs: Source<RewardEpoch[]>;
	payouts: Source<Payouts>;
	eligible: Source<EligibleStake[]>;
	supply: Source<number>;
};
export type RewardRow = RewardEpoch & {
	expected: number | null;
	ratio: number | null;
	status: string | null;
	tone: Tone;
	actual: number | null;
	payments: Payment[];
	explanation: string;
	payoutText: string;
	tooEarly: boolean;
};
export function validatePayouts(records: unknown[], address?: string): Payouts {
	const payments = new Map<string, Payment>();
	let complete = true;
	for (const raw of records) {
		if (!record(raw)) {
			complete = false;
			continue;
		}
		const sender = raw.sender ?? raw.from_address;
		const receiver = raw.receiver ?? raw.to_address;
		if (
			(sender !== undefined && !(REWARDS_ADDRESSES as readonly unknown[]).includes(sender)) ||
			(address && receiver !== undefined && receiver !== address)
		)
			continue;
		const amount = finite(raw.amount);
		if (
			typeof raw.txid !== 'string' ||
			!raw.txid.trim() ||
			typeof raw.tx_timestamp !== 'string' ||
			!Number.isFinite(Date.parse(raw.tx_timestamp)) ||
			amount === null ||
			!Number.isSafeInteger(amount) ||
			amount < 0
		) {
			complete = false;
			continue;
		}
		const payment = {
			txid: raw.txid.trim(),
			timestamp: new Date(raw.tx_timestamp).toISOString(),
			amount: amount / 1e6
		};
		const old = payments.get(payment.txid);
		if (old && (old.amount !== payment.amount || old.timestamp !== payment.timestamp))
			complete = false;
		else payments.set(payment.txid, payment);
	}
	return {
		payments: [...payments.values()].sort(
			(a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.txid.localeCompare(b.txid)
		),
		complete
	};
}
export async function loadPayouts(address: string, force = false): Promise<Payouts> {
	const params = new URLSearchParams({
		action: 'get_account_transactions_multi',
		from_addresses: `{${REWARDS_ADDRESSES.join(',')}}`,
		to_address: address
	});
	const result = await json(`/api/mimir?${params}`, force);
	if (!record(result) || !Array.isArray(result.data))
		throw new Error('Recorded epoch rewards unavailable');
	return validatePayouts(result.data, address);
}
export function completedEpoch(
	raw: unknown,
	epoch: number,
	address: string,
	pool: number
): RewardEpoch {
	// The API serialises an epoch with no proposers as [] rather than {}.
	const listed = record(raw) ? raw.proposers : undefined;
	const proposers = Array.isArray(listed) && listed.length === 0 ? {} : listed;
	if (
		!record(raw) ||
		!record(proposers) ||
		typeof raw.start_date !== 'string' ||
		typeof raw.end_date !== 'string' ||
		!Number.isFinite(Date.parse(raw.start_date)) ||
		!Number.isFinite(Date.parse(raw.end_date)) ||
		!Number.isFinite(pool) ||
		pool < 0
	)
		throw new Error('Invalid epoch snapshot');
	const total = count(raw.total_blocks);
	const ballast = epoch < 62 ? count(raw.ballast_blocks ?? 0) : 0;
	const blocks = count(proposers[address] ?? 0);
	const result = calculateEpochRewards(
		{ total_blocks: total, ballast_blocks: ballast },
		epoch,
		blocks,
		pool
	);
	return {
		epoch,
		blocks,
		networkBlocks: result.totalBlocksProduced,
		estimate: result.expectedReward,
		current: false
	};
}
export function liveEpoch(raw: unknown, epoch: number, address: string, pool: number): RewardEpoch {
	if (
		!record(raw) ||
		!Array.isArray(raw.data) ||
		typeof raw.max_timestamp !== 'string' ||
		!Number.isFinite(Date.parse(raw.max_timestamp))
	)
		throw new Error('Live epoch unavailable');
	count(raw.num_blocks);
	if (epoch < 62) count(raw.num_blocks_ballast);
	let blocks = 0;
	for (const row of raw.data) {
		if (!record(row) || typeof row.proposer !== 'string') throw new Error('Invalid live proposer');
		const produced = count(row.block_count);
		if (row.proposer === address) blocks += produced;
	}
	const progress = Math.max(
		0,
		Math.min(
			1,
			(Date.parse(raw.max_timestamp) - epochRange(epoch).start.getTime()) / (7 * 86400000)
		)
	);
	return {
		epoch,
		blocks,
		networkBlocks: blocksForEpoch(epoch, raw),
		estimate: null,
		current: true,
		progress,
		pool
	};
}
function missingEpoch(epoch: number): RewardEpoch {
	return { epoch, blocks: 0, networkBlocks: 0, estimate: null, current: false, missing: true };
}
/** The warning naming completed epochs whose snapshot is not yet published, or null if none. */
export function missingEpochsMessage(epochs: RewardEpoch[]): string | null {
	const missing = epochs
		.filter((epoch) => epoch.missing)
		.map((epoch) => epoch.epoch)
		.sort((a, b) => a - b);
	if (!missing.length) return null;
	if (missing.length === 1)
		return `Reward history incomplete: epoch ${missing[0]} is not yet available.`;
	const list = `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`;
	return `Reward history incomplete: epochs ${list} are not yet available.`;
}
export async function loadRewardEpochs(address: string, force = false): Promise<RewardEpoch[]> {
	const [dates, response] = await Promise.all([
		boundedRead(dataTable.fetchDateRanges(force)),
		json(walletSummaryUrl(address), force)
	]);
	const snapshots = record(response) ? response.snapshots : response;
	if (!Array.isArray(snapshots)) throw new Error('Reward history unavailable');
	if (!dates.length) return [];
	const latest = dates.at(-1)!;
	const result = await Promise.all(
		dates.slice(0, -1).map((date): RewardEpoch | Promise<RewardEpoch> => {
			const raw =
				snapshots.find(
					(item) =>
						record(item) &&
						item.start_date === epochRange(date.epoch).start.toISOString().replace('.000Z', 'Z')
				) ??
				snapshots.find(
					(item) =>
						record(item) &&
						typeof item.start_date === 'string' &&
						Date.parse(item.start_date) === epochRange(date.epoch).start.getTime()
				);
			return raw === undefined
				? missingEpoch(date.epoch)
				: getTokensByEpoch(date.epoch).then((pool) =>
						completedEpoch(raw, date.epoch, address, pool)
					);
		})
	);
	const [live, pool] = await Promise.all([
		boundedRead(dataTable.fetchData(latest.id, force)),
		getTokensByEpoch(latest.epoch)
	]);
	result.push(liveEpoch(live, latest.epoch, address, pool));
	return result;
}
export async function loadEligibleStakes(
	_address: string,
	force = false
): Promise<EligibleStake[]> {
	const raw = await json(epochHistory.statsUrl(), force);
	if (!record(raw) || !Array.isArray(raw.epochs)) throw new Error('Epoch stake unavailable');
	return raw.epochs.map((item) => {
		if (!record(item)) throw new Error('Invalid epoch stake');
		const epoch = count(item.epoch_number);
		const stake = finite(item.eligible_online_stake);
		if (epoch < 1 || stake === null || stake <= 0) throw new Error('Invalid eligible stake');
		return { epoch_number: epoch, eligible_online_stake: stake };
	});
}
export async function loadRewardSupply(): Promise<number> {
	const raw = await boundedRead(getSupplyInfo());
	if (
		!raw ||
		!Number.isFinite(raw['online-money']) ||
		!Number.isFinite(raw['blacklisted-money']) ||
		raw['blacklisted-money'] < 0 ||
		raw['online-money'] <= raw['blacklisted-money']
	)
		throw new Error('Eligible stake unavailable');
	return (raw['online-money'] - raw['blacklisted-money']) / 1e6;
}
export function recordedPayouts(payouts: Payouts) {
	let running = 0;
	return payouts.payments.map((payment) => ({ ...payment, running: (running += payment.amount) }));
}
export function cumulativePayouts(payouts: Payouts) {
	return payouts.complete ? recordedPayouts(payouts) : [];
}
export function mergeRewardRows(
	epochs: RewardEpoch[],
	payouts: Source<Payouts>,
	now: number,
	account?: RewardAccount,
	stakes: EligibleStake[] = [],
	liveStake?: number
): RewardRow[] {
	return epochs.map((epoch) => {
		const stake = epoch.current
			? liveStake
			: stakes.find((row) => row.epoch_number === epoch.epoch)?.eligible_online_stake;
		let expected =
			!epoch.missing && stake && account
				? (epoch.networkBlocks * (account.online ? account.balance : 0)) / stake
				: null;
		let ratio = expected !== null && expected > 0 ? epoch.blocks / expected : null;
		let estimate = epoch.estimate;
		let tooEarly = false;
		if (epoch.current) {
			const owner: WalletAccount | null = account
				? {
						address: 'page',
						contractId: 0,
						balance: account.balance,
						isParticipating: account.online,
						round: 0,
						voteLastValid: null
					}
				: null;
			const accounts = owner ? [owner] : [];
			const online = accounts.filter((item) => item.isParticipating);
			const summary = summarizeWalletEpochs({
				accounts,
				online,
				stakedOnline: online.reduce((total, item) => total + item.balance, 0),
				contractSet: 'ready',
				current: {
					epoch: epoch.epoch,
					networkBlocks: epoch.networkBlocks,
					blocks: { page: epoch.blocks },
					pool: epoch.pool ?? 0,
					progress: epoch.progress ?? 0,
					onlineStake: stake ?? null
				},
				history: []
			});
			expected = account ? summary.current.expected : null;
			ratio = account ? summary.current.ratio : null;
			estimate = account ? summary.current.reward : null;
			tooEarly =
				!!account?.online && (epoch.progress ?? 0) < 1 && (expected === null || expected < 50);
		}
		const start = epochRange(epoch.epoch + 1).start.getTime();
		const end = epochRange(epoch.epoch + 2).start.getTime();
		const known = payouts.value?.complete === true && !payouts.error;
		// Zero produced blocks establish no payout expectation, regardless of the payment source.
		// A missing snapshot leaves blocks unknown, so payments are still matched.
		const noBlocks = epoch.blocks === 0 && !epoch.missing;
		const payments =
			noBlocks || !known || epoch.current
				? []
				: payouts.value!.payments.filter(
						(payment) =>
							Date.parse(payment.timestamp) >= start && Date.parse(payment.timestamp) < end
					);
		const actual = payments.length
			? payments.reduce((sum, payment) => sum + payment.amount, 0)
			: null;
		const loading = payouts.state === 'loading';
		const status = noBlocks
			? null
			: epoch.missing
				? payments.length
					? 'Paid'
					: null
				: epoch.current
					? 'In progress'
					: loading
						? null
						: !known
							? 'Unavailable'
							: payments.length
								? 'Paid'
								: now < end
									? 'Pending'
									: 'Not found';
		const tone: Tone =
			status === 'Paid'
				? 'ok'
				: status === 'Pending' || status === 'Not found'
					? 'warn'
					: status === 'In progress'
						? 'info'
						: 'neutral';
		return {
			...epoch,
			estimate,
			expected,
			ratio,
			actual,
			payments,
			status,
			tone,
			tooEarly,
			explanation: status === 'Not found' ? 'No payment found in the following week.' : '',
			payoutText: noBlocks
				? 'No blocks'
				: epoch.missing
					? loading
						? 'Loading epoch rewards'
						: payments.length
							? ''
							: 'Not yet available'
					: loading && !epoch.current
						? 'Loading epoch rewards'
						: status === 'In progress' || status === 'Pending'
							? 'Not yet reported'
							: status === 'Paid'
								? ''
								: (status ?? 'Unavailable')
		};
	});
}
