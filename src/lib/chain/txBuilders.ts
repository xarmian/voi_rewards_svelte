import algosdk from 'algosdk';

// The one place the app builds payment and asset-transfer transactions, so the algosdk
// call shapes live in a single module (TASK-145). The golden tests in txBuilders.test.ts
// pin the encoded bytes these produce.

export type TxnParams = algosdk.SuggestedParams;

export type PaymentInput = {
	from: string;
	to: string;
	amount: number | bigint;
	note?: Uint8Array;
	suggestedParams: TxnParams;
	rekeyTo?: string;
};

export type AssetTransferInput = {
	from: string;
	to: string;
	assetIndex: number;
	amount: number | bigint;
	note?: Uint8Array;
	suggestedParams: TxnParams;
	closeRemainderTo?: string;
};

export function buildPayment(input: PaymentInput): algosdk.Transaction {
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender: input.from,
		receiver: input.to,
		amount: input.amount,
		note: input.note,
		suggestedParams: input.suggestedParams,
		rekeyTo: input.rekeyTo
	});
}

export function buildAssetTransfer(input: AssetTransferInput): algosdk.Transaction {
	return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
		sender: input.from,
		receiver: input.to,
		assetIndex: input.assetIndex,
		amount: input.amount,
		note: input.note,
		suggestedParams: input.suggestedParams,
		closeRemainderTo: input.closeRemainderTo
	});
}

// SendTokenModal merges the payments of one batch into a single payment that keeps the
// first payment's endpoints, note and round window.
export function buildCombinedPayment(
	first: algosdk.Transaction,
	totalAmount: bigint
): algosdk.Transaction {
	if (!first.payment)
		throw new Error('The first transaction of a combined payment is not a payment');
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender: first.sender,
		receiver: first.payment.receiver,
		amount: totalAmount,
		note: first.note,
		suggestedParams: {
			fee: first.fee,
			minFee: first.fee,
			firstValid: first.firstValid,
			lastValid: first.lastValid,
			genesisHash: first.genesisHash,
			genesisID: first.genesisID,
			flatFee: true
		}
	});
}

// Transactions built by the contract client come back with a group id and a note we may need to
// change before regrouping. algosdk 3 transactions are read-only, so this rebuilds one from its
// wire form: every field is kept except the group id, which is dropped, and the note, which is
// replaced when one is given.
export function withNoteNoGroup(tx: algosdk.Transaction, note?: Uint8Array): algosdk.Transaction {
	const data = tx.toEncodingData();
	data.delete('grp');
	if (note !== undefined) data.set('note', note);
	return algosdk.Transaction.fromEncodingData(data);
}
