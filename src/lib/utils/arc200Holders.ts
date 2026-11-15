import algosdk from 'algosdk';
import { decimalToBaseUnits } from '$lib/chain/baseUnits';
import { baseUnitsToDecimal } from '$lib/chain/sendAmounts';
import type { Recipient } from '$lib/types/recipients';

export const zeroAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';

export interface HolderBalance {
	accountId: string;
	balance?: string;
	decimals: number;
}

// getApplicationAddress returns an Address object in algosdk 3, and an object never === a string
// accountId, so the contract's own account must be converted before it is compared.
function contractAddress(contractId: string): string {
	return algosdk.getApplicationAddress(parseInt(contractId)).toString();
}

// Holders that can receive a distribution: not the zero address, not the contract's own account,
// not negative, and at or above the minimum when one is set.
export function filterHolders<T extends HolderBalance>(
	balances: T[],
	contractId: string,
	minimumBalance: number
): T[] {
	const creator = contractAddress(contractId);
	return balances.filter((balance) => {
		if (balance.accountId === zeroAddress || balance.accountId === creator) return false;
		if (balance.balance && balance.balance.startsWith('-')) return false;
		if (minimumBalance > 0) {
			const tokenBalance = Number(balance.balance) / Math.pow(10, balance.decimals);
			return tokenBalance >= minimumBalance;
		}
		return true;
	});
}

export type HolderDistributionType = 'equal' | 'proportional' | 'per-holder';

// Who is paid and how much, from the holders that passed filterHolders.
export function buildHolderRecipients(
	validHolders: HolderBalance[],
	distributionType: HolderDistributionType,
	amountValue: string
): Recipient[] {
	let totalBalance = 0n;
	let poolUnits = 0n;

	if (distributionType === 'proportional') {
		totalBalance = validHolders.reduce((sum, holder) => sum + BigInt(holder.balance ?? '0'), 0n);
		try {
			poolUnits = decimalToBaseUnits(amountValue, 8);
		} catch {
			// Leave amounts blank when the pool is not a valid decimal.
		}
	}

	const recipients: Recipient[] = [];

	validHolders.forEach((holder) => {
		let amount = '';

		if (distributionType !== 'equal') {
			if (distributionType === 'per-holder') {
				amount = String(amountValue);
			} else if (distributionType === 'proportional' && totalBalance > 0n) {
				const share = (poolUnits * BigInt(holder.balance ?? '0')) / totalBalance;
				amount = share === 0n ? '' : baseUnitsToDecimal(share, 8);
			}
		} else {
			// Equal distribution (amount will be calculated by the recipient table)
			amount = '';
		}

		recipients.push({
			address: holder.accountId,
			amount,
			note: '',
			info: null,
			isLoading: false,
			isValid: true
		});
	});

	return recipients;
}

// The same exclusions with no minimum, counting only holders that report a balance.
export function countValidHolders(balances: HolderBalance[], contractId: string): number {
	const creator = contractAddress(contractId);
	return balances.filter(
		(balance) =>
			balance.accountId !== zeroAddress &&
			balance.accountId !== creator &&
			balance.balance &&
			!balance.balance.startsWith('-')
	).length;
}
