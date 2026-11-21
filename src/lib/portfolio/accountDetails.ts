export type Part<T> = { status: 'loaded'; value: T } | { status: 'unavailable'; error: string };

export type AccountSnapshot = {
	balance: number;
	status: string;
	minBalance: number;
	pendingRewards: number;
	round: number;
	voteLastValid?: number;
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
}

export async function loadAccountDetails(
	address: string,
	deps: AccountDetailsDeps,
	options: {
		onAccount?: (result: Part<AccountSnapshot>) => void;
		timeoutMs?: number;
	} = {}
): Promise<Part<AccountSnapshot>> {
	const timeoutMs = options.timeoutMs ?? 15000;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let result: Part<AccountSnapshot>;
	try {
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				reject(new Error(`timed out after ${timeoutMs / 1000}s`));
			}, timeoutMs);
		});
		result = {
			status: 'loaded',
			value: snapshotFromAlgodAccount(await Promise.race([deps.fetchAccount(address), timeout]))
		};
	} catch (error) {
		result = {
			status: 'unavailable',
			error: error instanceof Error ? error.message : String(error)
		};
	} finally {
		clearTimeout(timer);
	}
	try {
		options.onAccount?.(result);
	} catch {
		// A consumer callback must not interrupt the load.
	}
	return result;
}
