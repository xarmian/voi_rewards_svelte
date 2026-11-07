import { config } from '$lib/config';
import { epochRange } from '$lib/epochs';
import { blocksForEpoch, finite } from '$lib/home/headline';
import { calculateEpochRewards, REWARDS_ADDRESSES } from '$lib/rewards/calculateEpochRewards';
import { requireAccountInfo, getSupplyInfo, onlineStakeStore } from '$lib/stores/accounts';
import { getTokensByEpoch } from '$lib/utils';
import { dataTable } from '../../stores/dataTable';
import { summarizeWallet, type WalletAccount } from './summary';
import { boundedRead, type Source } from './read';
import type { Tone } from '$lib/ds/types';

export type RewardEpoch = {
	epoch: number;
	blocks: number;
	networkBlocks: number;
	estimate: number | null;
	current: boolean;
	progress?: number;
	pool?: number;
};
export type Payment = { txid: string; timestamp: string; amount: number };
export type Payouts = { payments: Payment[]; complete: boolean };
export type RewardAccount = { balance: number; online: boolean };
export type EligibleStake = { epoch_number: number; eligible_online_stake: number };
export type DailyStake = { date: string; avg_online_stake: number };
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
export type RewardsState = {
	epochs: Source<RewardEpoch[]>;
	payouts: Source<Payouts>;
	daily: Source<Record<string, unknown[]>>;
	account: Source<RewardAccount>;
	eligible: Source<EligibleStake[]>;
	dailyStake: Source<DailyStake[]>;
	supply: Source<number>;
};
export function createRewardsState(): RewardsState {
	return {
		epochs: { state: 'loading' },
		payouts: { state: 'loading' },
		daily: { state: 'loading' },
		account: { state: 'loading' },
		eligible: { state: 'loading' },
		dailyStake: { state: 'loading' },
		supply: { state: 'loading' }
	};
}
const record = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);
function count(value: unknown): number {
	const number = finite(value);
	if (number === null || !Number.isSafeInteger(number) || number < 0)
		throw new Error('Invalid block count');
	return number;
}
async function json(url: string, force = false): Promise<unknown> {
	return boundedRead(
		fetch(url, { cache: force ? 'no-store' : 'default', signal: AbortSignal.timeout(15000) }).then(
			async (response) => {
				if (!response.ok) throw new Error(`Request failed: HTTP ${response.status}`);
				const result: unknown = await response.json();
				if (record(result) && 'error' in result) throw new Error('Source unavailable');
				return result;
			}
		)
	);
}
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
		throw new Error('Recorded payouts unavailable');
	return validatePayouts(result.data, address);
}
export function completedEpoch(
	raw: unknown,
	epoch: number,
	address: string,
	pool: number
): RewardEpoch {
	if (
		!record(raw) ||
		!record(raw.proposers) ||
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
	const blocks = count(raw.proposers[address] ?? 0);
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
export async function loadRewardEpochs(address: string, force = false): Promise<RewardEpoch[]> {
	const [dates, response] = await Promise.all([
		boundedRead(dataTable.fetchDateRanges(force)),
		json(
			`${config.proposalApiBaseUrl}?action=epoch-summary&wallet=${encodeURIComponent(address)}`,
			force
		)
	]);
	const snapshots = record(response) ? response.snapshots : response;
	if (!Array.isArray(snapshots)) throw new Error('Reward history unavailable');
	if (!dates.length) return [];
	const latest = dates.at(-1)!;
	const result = await Promise.all(
		dates.slice(0, -1).flatMap((date) => {
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
				? []
				: [
						getTokensByEpoch(date.epoch).then((pool) =>
							completedEpoch(raw, date.epoch, address, pool)
						)
					];
		})
	);
	const [live, pool] = await Promise.all([
		boundedRead(dataTable.fetchData(latest.id, force)),
		getTokensByEpoch(latest.epoch)
	]);
	result.push(liveEpoch(live, latest.epoch, address, pool));
	return result;
}
export async function loadRewardAccount(address: string, force = false): Promise<RewardAccount> {
	const raw = await boundedRead(requireAccountInfo(address, { force }));
	const amount = Number(raw.amount);
	if (
		raw.amount == null ||
		(typeof raw.amount === 'string' && !String(raw.amount).trim()) ||
		!Number.isFinite(amount) ||
		amount < 0 ||
		typeof raw.status !== 'string'
	)
		throw new Error('Account balance unavailable');
	return { balance: amount / 1e6, online: raw.status === 'Online' };
}
export async function loadEligibleStakes(
	_address: string,
	force = false
): Promise<EligibleStake[]> {
	const raw = await json('/api/epochs', force);
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
export async function loadDailyStake(_address: string, force = false): Promise<DailyStake[]> {
	const raw = await boundedRead(force ? onlineStakeStore.refresh() : onlineStakeStore.getData());
	if (!Array.isArray(raw)) throw new Error('Daily stake unavailable');
	return raw.map((item) => {
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
			!Number.isFinite(item.avg_online_stake) ||
			item.avg_online_stake <= 0
		)
			throw new Error('Invalid daily stake');
		return item;
	});
}
export async function loadDailyProposals(
	address: string,
	force = false
): Promise<Record<string, unknown[]>> {
	const raw = await json(
		`${config.proposalApiBaseUrl}?action=proposals&wallet=${encodeURIComponent(address)}`,
		force
	);
	if (
		!record(raw) ||
		Object.entries(raw).some(
			([date, value]) =>
				!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
				!Number.isFinite(Date.parse(date)) ||
				!Array.isArray(value)
		)
	)
		throw new Error('Invalid daily proposals');
	return raw as Record<string, unknown[]>;
}
export function dailyProposals(
	raw: Record<string, unknown[]>,
	balanceMicro: number | null,
	stakes: DailyStake[],
	now: Date
) {
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return Array.from({ length: 30 }, (_, index) => {
		const date = new Date(today - (29 - index) * 86400000).toISOString().slice(0, 10);
		const stake = stakes.find((row) => row.date === date)?.avg_online_stake;
		return {
			date,
			actual: Array.isArray(raw[date]) ? raw[date].length : null,
			expected:
				balanceMicro !== null && stake !== undefined && stake > 0
					? (balanceMicro / 1e6 / (stake / 1e6)) * (86400 / 2.8)
					: null,
			current: index === 29
		};
	});
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
			stake && account
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
						voteLastValid: null,
						lastVoteAt: null,
						lastBlock: null
					}
				: null;
			const summary = summarizeWallet({
				owner,
				contracts: [],
				current: {
					epoch: epoch.epoch,
					networkBlocks: epoch.networkBlocks,
					blocks: { page: epoch.blocks },
					pool: epoch.pool ?? 0,
					progress: epoch.progress ?? 0,
					onlineStake: stake ?? null
				},
				history: [],
				now,
				state: 'ready'
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
		const noBlocks = epoch.blocks === 0;
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
		const status = noBlocks
			? null
			: epoch.current
				? 'In progress'
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
				: status === 'In progress' || status === 'Pending'
					? 'Not yet reported'
					: status === 'Paid'
						? ''
						: (status ?? 'Unavailable')
		};
	});
}
