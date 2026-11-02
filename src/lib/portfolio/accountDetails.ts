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
	'confirmed-round': number;
	'payment-transaction'?: { amount: number };
};

export function snapshotFromAlgodAccount(raw: Record<string, unknown>): AccountSnapshot {
	function numberField(key: string): number {
		const value = raw[key];
		if (typeof value !== 'number' || !Number.isFinite(value)) {
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
		minBalance: numberField('min-balance'),
		pendingRewards: numberField('pending-rewards'),
		round: numberField('round')
	};
	if (raw.participation && typeof raw.participation === 'object') {
		const lastValid = (raw.participation as Record<string, unknown>)['vote-last-valid'];
		if (typeof lastValid === 'number') snapshot.voteLastValid = lastValid;
	}
	return snapshot;
}

export interface AccountDetailsDeps {
	fetchAccount(address: string): Promise<Record<string, unknown>>;
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
	return transactions.reduce((sum, tx) => {
		if (tx['confirmed-round'] < 1520000) return sum;
		if (tx['payment-transaction']) {
			return sum + tx['payment-transaction'].amount;
		}
		return sum;
	}, 0);
}
