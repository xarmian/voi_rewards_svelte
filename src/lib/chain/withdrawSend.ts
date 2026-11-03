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
		if (
			input.txns.every(
				(txn): txn is { txID(): string } =>
					txn !== null && typeof txn === 'object' && 'txID' in txn && typeof txn.txID === 'function'
			) &&
			(input.txns.length !== info.txIds.length ||
				input.txns.some((txn, index) => txn.txID() !== info.txIds[index]))
		) {
			return {
				status: 'not-signed',
				error: 'The wallet returned a different transaction group, so nothing was sent.'
			};
		}
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
		let submitError: unknown;
		const outcome = await sendAndConfirm(signed, {
			...deps.send,
			send: async (group) => {
				try {
					return await deps.send.send(group);
				} catch (error) {
					submitError = error;
					throw error;
				}
			}
		});
		if (outcome.status === 'rejected') {
			const error = submitError as
				| {
						status?: unknown;
						message?: unknown;
						response?: { body?: { message?: unknown }; text?: unknown };
				  }
				| undefined;
			// algosdk's own message is always non-empty: the status prefix, plus the algod body text only
			// when the response carried a JSON message. A bare prefix (a proxy 400 with no algod body)
			// proves nothing, so only the text after it counts.
			const algosdkPrefix = /^\s*Network request error\. Received status \d+ \([^)]*\)\s*:?\s*/i;
			const bodyText = (message: unknown) =>
				typeof message === 'string' ? message.replace(algosdkPrefix, '').trim() : '';
			// response.text is the raw body and is NOT evidence: a proxy can answer 400 with JSON that has
			// no `message` key. algosdk copies the algod text into error.message only when the body had
			// one, and response.body.message is that same field.
			const messages = [bodyText(error?.message), bodyText(error?.response?.body?.message)].filter(
				(message) => message.length > 0
			);
			// Wording that says the TRANSACTION exists (ledger, pool, duplicate) keeps the hold. It must
			// not match an asset, application or account that does not exist, or an ordinary rejection
			// would hold the contract for a whole validity window for a transaction that never landed.
			const alreadyExists =
				/already\s+in\s+(the\s+)?(transaction\s+)?(ledger|pool)|already\s+(been\s+)?(committed|confirmed|submitted|included|known|seen)|duplicate|\b(transaction|txn|txgroup)\b[^.]{0,40}\bexists?\b|\bexists?\s+in\s+(the\s+)?(transaction\s+)?(ledger|pool)\b/i;
			if (
				error?.status !== 400 ||
				messages.length === 0 ||
				messages.some((message) => alreadyExists.test(message))
			) {
				return pending;
			}
		}
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
