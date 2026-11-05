export type Part<T> = { status: 'loaded'; value: T } | { status: 'unavailable'; error: string };

export type AccountSnapshot = {
	balance: number;
	status: string;
	minBalance: number;
	pendingRewards: number;
	round: number;
	voteLastValid?: number;
};

export type RewardsTransaction = {
	sender: string;
	confirmedRound?: bigint | number;
	paymentTransaction?: { amount: bigint | number };
};

/** The fields of algosdk's account model this reads. Rounds and amounts are bigint there. */
export type AlgodAccount = {
	amount?: unknown;
	status?: unknown;
	minBalance?: unknown;
	pendingRewards?: unknown;
	round?: unknown;
	participation?: { voteLastValid?: unknown } | null;
};

// A number or bigint that is a whole, safe value; anything else is not evidence of a balance.
export function safeNumber(value: unknown): number | undefined {
	if (typeof value === 'bigint') {
		return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
			? Number(value)
			: undefined;
	}
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function snapshotFromAlgodAccount(raw: AlgodAccount): AccountSnapshot {
	function numberField(key: keyof AlgodAccount): number {
		const value = safeNumber(raw[key]);
		if (value === undefined) {
			throw new Error(`Invalid account: ${key} must be a finite number`);
		}
		return value;
	}

	const balance = numberField('amount');
	if (balance < 0) throw new Error('Invalid account: amount must be non-negative');
	if (typeof raw.status !== 'string' || !raw.status.trim()) {
		throw new Error('Invalid account: status must be a non-empty string');
	}

	const snapshot: AccountSnapshot = {
		balance,
		status: raw.status,
		minBalance: numberField('minBalance'),
		pendingRewards: numberField('pendingRewards'),
		round: numberField('round')
	};
	if (raw.participation && typeof raw.participation === 'object') {
		const lastValid = safeNumber(raw.participation.voteLastValid);
		if (lastValid !== undefined) snapshot.voteLastValid = lastValid;
	}
	return snapshot;
}

export interface AccountDetailsDeps {
	fetchAccount(address: string): Promise<AlgodAccount>;
	lookupCreatedAt(address: string): Promise<number>;
	fetchRewardsTransactions(address: string): Promise<RewardsTransaction[]>;
}

export async function loadAccountDetails(
	address: string,
	deps: AccountDetailsDeps,
	options: {
		onPart?: (
			...part:
				| ['account', Part<AccountSnapshot>]
				| ['createdAt', Part<number>]
				| ['rewards', Part<RewardsTransaction[]>]
		) => void;
		timeoutMs?: number;
	} = {}
): Promise<{
	account: Part<AccountSnapshot>;
	createdAt: Part<number>;
	rewards: Part<RewardsTransaction[]>;
}> {
	const timeoutMs = options.timeoutMs ?? 15000;
	async function settle<T>(
		lookup: () => Promise<T>,
		onPart: (result: Part<T>) => void
	): Promise<Part<T>> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let result: Part<T>;
		try {
			const timeout = new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					reject(new Error(`timed out after ${timeoutMs / 1000}s`));
				}, timeoutMs);
			});
			result = { status: 'loaded', value: await Promise.race([lookup(), timeout]) };
		} catch (error) {
			result = {
				status: 'unavailable',
				error: error instanceof Error ? error.message : String(error)
			};
		} finally {
			clearTimeout(timer);
		}
		try {
			onPart(result);
		} catch {
			// A consumer callback must not interrupt the independent lookups.
		}
		return result;
	}

	const [account, createdAt, rewards] = await Promise.all([
		settle(
			async () => snapshotFromAlgodAccount(await deps.fetchAccount(address)),
			(result) => options.onPart?.('account', result)
		),
		settle(
			() => deps.lookupCreatedAt(address),
			(result) => options.onPart?.('createdAt', result)
		),
		settle(
			() => deps.fetchRewardsTransactions(address),
			(result) => options.onPart?.('rewards', result)
		)
	]);
	return { account, createdAt, rewards };
}

export function totalRewardsMicroVoi(transactions: RewardsTransaction[]): number {
	let sum = 0n;
	for (const tx of transactions) {
		// A transaction with no confirmed round is not a payout.
		if (tx.confirmedRound === undefined || tx.confirmedRound < 1520000) continue;
		if (tx.paymentTransaction) sum += BigInt(tx.paymentTransaction.amount);
	}
	return Number(sum);
}
