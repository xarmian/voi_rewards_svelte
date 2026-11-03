import {
	clearPendingWithdrawal,
	getPendingWithdrawal,
	rememberPendingWithdrawal,
	type PendingWithdrawalStorage
} from './pendingWithdrawals';
import { groupInfo, sendAndConfirm, type SendDependencies } from './sendAndConfirm';

export type WithdrawSendOutcome =
	| { status: 'not-signed'; error: string }
	| { status: 'not-recorded'; error: string }
	| { status: 'rejected'; txId: string; error: string }
	| { status: 'confirmed'; txId: string; confirmedRound: number }
	| { status: 'pending'; txId: string; lastValid: number };

export function canOfferWithdraw(input: {
	status: string;
	wallet: string | undefined;
	contractId: number;
	storage?: PendingWithdrawalStorage;
}): boolean {
	return (
		input.status === 'idle' &&
		!!input.wallet &&
		!getPendingWithdrawal(input.wallet, input.contractId, input.storage)
	);
}

export async function sendWithdrawal(
	input: { wallet: string; contractId: number; txns: unknown[] },
	deps: {
		sign(groups: unknown[][]): Promise<Uint8Array[] | null | undefined>;
		send: SendDependencies;
		now?(): number;
		storage?: PendingWithdrawalStorage;
	}
): Promise<WithdrawSendOutcome> {
	let signed: Uint8Array[];
	let info: ReturnType<typeof groupInfo>;
	try {
		const result = await deps.sign([input.txns]);
		if (!result?.length) return { status: 'not-signed', error: 'Signature was rejected' };
		signed = result;
		info = groupInfo(signed);
	} catch (error) {
		return {
			status: 'not-signed',
			error: error instanceof Error && error.message ? error.message : 'Signature was rejected'
		};
	}

	const pending = { status: 'pending', txId: info.firstTxId, lastValid: info.lastValid } as const;
	try {
		rememberPendingWithdrawal(
			input.wallet,
			input.contractId,
			{
				txId: info.firstTxId,
				lastValid: info.lastValid,
				createdAt: (deps.now ?? Date.now)()
			},
			deps.storage
		);
	} catch {
		return {
			status: 'not-recorded',
			error: "Couldn't save the pending withdrawal, so nothing was sent."
		};
	}

	try {
		const outcome = await sendAndConfirm(signed, deps.send);
		if (outcome.status === 'rejected' || outcome.status === 'confirmed') {
			clearPendingWithdrawal(input.wallet, input.contractId, info.firstTxId, deps.storage);
			return outcome.status === 'rejected'
				? { status: 'rejected', txId: info.firstTxId, error: outcome.error }
				: { status: 'confirmed', txId: info.firstTxId, confirmedRound: outcome.confirmedRound };
		}
	} catch {
		// Once signed and recorded, an unexpected failure cannot prove nothing was sent.
	}
	return pending;
}
