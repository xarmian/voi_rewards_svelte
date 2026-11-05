import {
	safeNumber,
	snapshotFromAlgodAccount,
	type AlgodAccount
} from '../portfolio/accountDetails';
import type { Recipient } from '../types/recipients';

// One asset an account holds. The id and amount are bigint in algosdk 3's account model.
type AssetHolding = { assetId?: unknown; amount?: unknown };

let lookupId = 0;

export function nextLookupId(): number {
	return ++lookupId;
}

export function tokenKey(t: { type?: string; id?: string | number }): string {
	return t.type === 'native' ? 'native' : `${t.type}:${t.id}`;
}

export type RecipientTokenKind =
	| { kind: 'native' }
	| { kind: 'vsa'; assetId: number }
	| { kind: 'arc200' };

export type RecipientInfoResult =
	| { status: 'loaded'; info: { balance: number; hasOptedIn: boolean; assetBalance: number } }
	| { status: 'unavailable'; error: string };

export function applyRecipientLookup(
	rows: Recipient[],
	address: string,
	lookupId: number,
	result: RecipientInfoResult
): Recipient[] {
	return rows.map((row) => {
		if (row.address !== address || !row.isLoading || row.lookupId !== lookupId) return row;
		return {
			...row,
			info: result.status === 'loaded' ? result.info : null,
			isValid: result.status === 'loaded',
			lookupError: result.status === 'unavailable' ? result.error : null,
			isLoading: false
		};
	});
}

export interface RecipientInfoDeps {
	fetchAccount(address: string): Promise<AlgodAccount & { assets?: readonly AssetHolding[] }>;
	arc200BalanceOf(address: string): Promise<{ success: boolean; returnValue: unknown }>;
}

export async function loadRecipientInfo(
	address: string,
	token: RecipientTokenKind,
	deps: RecipientInfoDeps
): Promise<RecipientInfoResult> {
	try {
		const raw = await deps.fetchAccount(address);
		const { balance } = snapshotFromAlgodAccount(raw);
		// algosdk 3 models always carry the property, and leave it undefined when nothing is held.
		const assets = raw.assets === undefined ? [] : raw.assets;
		if (!Array.isArray(assets)) {
			throw new Error('Invalid account: assets must be an array');
		}
		let hasOptedIn = false;
		let assetBalance = 0;

		if (token.kind === 'vsa') {
			const holding = assets.find((asset) => Number(asset?.assetId) === token.assetId);
			if (holding) {
				const amount = safeNumber(holding.amount);
				if (amount === undefined || amount < 0) {
					throw new Error('Invalid account: asset amount must be a finite non-negative number');
				}
				hasOptedIn = true;
				assetBalance = amount;
			}
		} else if (token.kind === 'arc200') {
			const result = await deps.arc200BalanceOf(address);
			if (result.success !== true) throw new Error('ARC-200 balance lookup failed');
			assetBalance = Number(result.returnValue);
			if (!Number.isFinite(assetBalance) || assetBalance < 0) {
				throw new Error('Invalid ARC-200 balance: must be a finite non-negative number');
			}
			hasOptedIn = true;
		}

		return { status: 'loaded', info: { balance, hasOptedIn, assetBalance } };
	} catch (error) {
		return { status: 'unavailable', error: error instanceof Error ? error.message : String(error) };
	}
}
