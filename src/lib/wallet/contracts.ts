import type { ContractDetails } from '$lib/types';
import type { WalletContract } from './summary';

/** Unknown account reads retain the source list's identity, without invented zero balances. */
export type ContractRow = Omit<WalletContract, 'balance' | 'isParticipating' | 'round'> & {
	balance: number | null;
	isParticipating: boolean | null;
	round: number | null;
};
export type ContractsSnapshot = {
	contracts: ContractRow[];
	contractSet: 'ready' | 'unavailable';
	asOf: string;
};

/** Browser caller only. Independent of price, tokens, supply and reward history. */
export async function loadContracts(
	ownerAddress: string,
	pageAddress: string,
	force = false
): Promise<ContractsSnapshot> {
	const [{ getLockContractsByOwner }, { bounded, readContract }] = await Promise.all([
		import('$lib/services/lockvest'),
		import('./load')
	]);
	let locks: Awaited<ReturnType<typeof getLockContractsByOwner>>;
	try {
		locks = await bounded(getLockContractsByOwner(ownerAddress));
		if (
			!Array.isArray(locks) ||
			locks.some(
				(c) => !c.contractAddress || !Number.isSafeInteger(c.contractId) || c.contractId <= 0
			)
		)
			throw new Error('Invalid lock contract population');
	} catch (error) {
		console.error('Lockvest lookup failed:', error);
		return { contracts: [], contractSet: 'unavailable', asOf: new Date().toISOString() };
	}
	const population = [...new Map(locks.map((c) => [c.contractId, c])).values()].filter(
		(c) => pageAddress === ownerAddress || c.contractAddress === pageAddress
	);
	const contracts = await Promise.all(
		population.map(async (lock): Promise<ContractRow> => {
			const identity: WalletContract = {
				address: lock.contractAddress,
				contractId: lock.contractId,
				balance: 0,
				isParticipating: false,
				round: 0,
				voteLastValid: null,
				lastVoteAt: null,
				lastBlock: null,
				details: null
			};
			try {
				const details = await bounded(readContract(identity, force));
				if (!Number.isFinite(details.balance) || details.balance < 0)
					throw new Error('Contract balance unavailable');
				return {
					...identity,
					details,
					balance: details.balance / 1e6,
					isParticipating: details.isParticipating,
					round: Number.isFinite(details.accountInfo?.round) ? details.accountInfo!.round : null,
					voteLastValid: details.accountInfo?.participation?.voteLastValid ?? null,
					lastVoteAt: details.consensusDetails?.last_vote_timestamp ?? null,
					lastBlock: details.consensusDetails?.last_block ?? null
				};
			} catch {
				return { ...identity, balance: null, isParticipating: null, round: null };
			}
		})
	);
	return { contracts, contractSet: 'ready', asOf: new Date().toISOString() };
}

const nonnegative = (n: unknown): n is number =>
	typeof n === 'number' && Number.isFinite(n) && n >= 0;
export function summarizeContracts(contracts: ContractRow[]) {
	const complete = contracts.every(
		(c) =>
			c.details &&
			nonnegative(c.balance) &&
			nonnegative(c.details.lockedBalance) &&
			nonnegative(c.details.availableForWithdrawal)
	);
	return {
		count: contracts.length,
		locked: complete
			? contracts.reduce((sum, c) => sum + Math.min(c.balance!, c.details!.lockedBalance / 1e6), 0)
			: null,
		available: complete
			? contracts.reduce((sum, c) => sum + c.details!.availableForWithdrawal / 1e6, 0)
			: null
	};
}
export type VestingEvent = { contractId: number; date: string; amount: number };
export type VestingMonth = { date: string; amount: number; cumulative: number };

function projectSchedule(details: ContractDetails): VestingEvent[] | null {
	const total = Number(details.totalAmount);
	if (
		!nonnegative(total) ||
		total <= 0 ||
		!nonnegative(details.fundingTime) ||
		details.fundingTime === 0 ||
		!Number.isSafeInteger(details.distributionCount) ||
		details.distributionCount <= 0 ||
		!Number.isFinite(details.distributionSeconds) ||
		details.distributionSeconds <= 0 ||
		!nonnegative(details.remainingVestingAmount) ||
		details.remainingVestingAmount > total
	)
		return null;
	if (details.isFullyVested)
		return details.remainingVestingAmount === 0 && details.nextVestingDate === null ? [] : null;
	const amount = details.nextVestingAmount;
	const first = details.nextVestingDate?.getTime();
	const remaining = details.remainingVestingAmount;
	const tolerance = Math.max(1, total) * 1e-10;
	if (
		!nonnegative(amount) ||
		amount === 0 ||
		!Number.isFinite(first) ||
		remaining < amount ||
		Math.abs(amount - total / details.distributionCount) > tolerance
	)
		return null;
	const count = Math.round(remaining / amount);
	if (
		count < 1 ||
		count > details.distributionCount ||
		Math.abs(count * amount - remaining) > tolerance
	)
		return null;
	const last = first! + (count - 1) * details.distributionSeconds * 1000;
	if (!Number.isFinite(new Date(last).getTime())) return null;
	return Array.from({ length: count }, (_, index) => ({
		contractId: details.contractId,
		date: new Date(first! + index * details.distributionSeconds * 1000).toISOString(),
		amount: Math.min(amount, remaining - index * amount) / 1e6
	}));
}

/** Display projection only. The reader's first event and raw transaction inputs remain unchanged. */
export function buildVestingTimeline(contracts: ContractRow[], now = Date.now()) {
	const events: VestingEvent[] = [];
	const unavailable: number[] = [];
	for (const contract of contracts) {
		const schedule = contract.details ? projectSchedule(contract.details) : null;
		if (schedule === null) unavailable.push(contract.contractId);
		else events.push(...schedule);
	}
	events.sort((a, b) => a.date.localeCompare(b.date) || a.contractId - b.contractId);
	const months: VestingMonth[] = [];
	if (!unavailable.length && events.length) {
		// A clock that has passed the first loaded release still shows the loaded schedule.
		const start = Math.min(now, Date.parse(events[0].date));
		months.push({ date: new Date(start).toISOString(), amount: 0, cumulative: 0 });
		const grouped = new Map<string, number>();
		for (const event of events) {
			const month = event.date.slice(0, 7);
			grouped.set(month, (grouped.get(month) ?? 0) + event.amount);
		}
		let cumulative = 0;
		for (const [month, amount] of grouped) {
			cumulative += amount;
			const [year, number] = month.split('-').map(Number);
			months.push({
				date: new Date(Date.UTC(year, number, 1) - 1).toISOString(),
				amount,
				cumulative
			});
		}
	}
	return { complete: unavailable.length === 0, unavailable, events, months };
}

/** Chart time domain: always contains every plotted point, even when the clock is past a loaded release. */
export function scheduleDomain(months: { date: string }[], now: number): [Date, Date] {
	const first = months[0] ? Date.parse(months[0].date) : now;
	const last = months.at(-1) ? Date.parse(months.at(-1)!.date) : now + 86400000;
	return [new Date(Math.min(now, first)), new Date(Math.max(last, Math.min(now, first)))];
}
