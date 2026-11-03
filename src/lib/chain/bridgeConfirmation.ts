export interface ExpectedBridgeConfirmation {
	sourceTxId: string;
	sourceNetwork: number;
	bridgeAddress: string;
	destinationAddress: string;
	destinationAssetId: string | number | null;
	destinationAmount: bigint | number | string;
}

export type BridgeConfirmationMatch =
	| { status: 'match' }
	| { status: 'amount-mismatch'; expected: bigint; actual: bigint }
	| { status: 'no-match'; reason: string };

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function atomicAmount(value: unknown): bigint | undefined {
	try {
		if (typeof value === 'number') {
			if (!Number.isFinite(value) || !Number.isInteger(value)) return;
		} else if (typeof value === 'string') {
			if (!value.trim()) return;
		} else if (typeof value !== 'bigint') return;
		const amount = BigInt(value);
		return amount >= 0n ? amount : undefined;
	} catch {
		return undefined;
	}
}

export function matchBridgeConfirmation(
	tx: unknown,
	expected: ExpectedBridgeConfirmation
): BridgeConfirmationMatch {
	const miss = (reason: string): BridgeConfirmationMatch => ({ status: 'no-match', reason });
	try {
		if (!isObject(tx)) return miss('transaction');
		if (typeof tx.note !== 'string') return miss('note');
		let decoded: string;
		try {
			const bytes = Uint8Array.from(atob(tx.note), (character) => character.charCodeAt(0));
			decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		} catch {
			return miss('note');
		}
		const prefix = 'aramid-confirm/v1:j';
		if (!decoded.startsWith(prefix)) return miss('note');
		let note: unknown;
		try {
			note = JSON.parse(decoded.slice(prefix.length));
		} catch {
			return miss('note');
		}
		if (
			!isObject(note) ||
			note.sourceTxId !== expected.sourceTxId ||
			note.sourceNetwork !== expected.sourceNetwork
		)
			return miss('note');
		if (tx.sender !== expected.bridgeAddress) return miss('sender');
		const native =
			expected.destinationAssetId === null ||
			expected.destinationAssetId === 0 ||
			expected.destinationAssetId === '0';
		if (tx['tx-type'] !== (native ? 'pay' : 'axfer')) return miss('type');
		const transfer = tx[native ? 'payment-transaction' : 'asset-transfer-transaction'];
		if (!isObject(transfer)) return miss('transfer');
		if (!native && transfer['asset-id'] !== Number(expected.destinationAssetId))
			return miss('asset');
		if (transfer.receiver !== expected.destinationAddress) return miss('receiver');
		const expectedAmount = atomicAmount(expected.destinationAmount);
		const actual = atomicAmount(transfer.amount);
		if (expectedAmount === undefined || actual === undefined) return miss('amount');
		return expectedAmount === actual
			? { status: 'match' }
			: { status: 'amount-mismatch', expected: expectedAmount, actual };
	} catch {
		return miss('malformed');
	}
}
