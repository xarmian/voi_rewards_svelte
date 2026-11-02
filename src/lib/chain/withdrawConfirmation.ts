export type WithdrawOutcome =
	| { status: 'confirmed'; confirmedRound: number }
	| { status: 'pending'; poolError?: string };

export async function awaitWithdrawalConfirmation(
	txId: string,
	deps: {
		pendingInfo(txId: string): Promise<{ 'confirmed-round'?: number; 'pool-error'?: string }>;
		pause(ms: number): Promise<void>;
	},
	{ attempts = 15, intervalMs = 4000 }: { attempts?: number; intervalMs?: number } = {}
): Promise<WithdrawOutcome> {
	let poolError: string | undefined;

	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			const info = await deps.pendingInfo(txId);
			const confirmedRound = info['confirmed-round'];
			const currentPoolError = info['pool-error'];
			if (currentPoolError) {
				poolError = currentPoolError;
			} else if (typeof confirmedRound === 'number' && confirmedRound > 0) {
				return { status: 'confirmed', confirmedRound };
			}
		} catch {
			// A lookup failure leaves confirmation unknown.
		}

		if (attempt < attempts - 1) {
			try {
				await deps.pause(intervalMs);
			} catch {
				// A pause failure also provides no evidence about the transaction.
			}
		}
	}

	return poolError ? { status: 'pending', poolError } : { status: 'pending' };
}
