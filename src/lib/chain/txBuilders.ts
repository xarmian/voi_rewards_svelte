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
		from: input.from,
		to: input.to,
		amount: input.amount,
		note: input.note,
		suggestedParams: input.suggestedParams,
		rekeyTo: input.rekeyTo
	});
}

export function buildAssetTransfer(input: AssetTransferInput): algosdk.Transaction {
	return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
		from: input.from,
		to: input.to,
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
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		from: algosdk.encodeAddress(first.from.publicKey),
		to: algosdk.encodeAddress(first.to.publicKey),
		amount: totalAmount,
		note: first.note,
		suggestedParams: {
			fee: first.fee,
			firstRound: first.firstRound,
			lastRound: first.lastRound,
			genesisHash: Buffer.from(first.genesisHash).toString('base64'),
			genesisID: first.genesisID,
			flatFee: true
		}
	});
}
