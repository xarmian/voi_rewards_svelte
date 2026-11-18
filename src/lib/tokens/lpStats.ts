import type { FungibleTokenType, LPToken } from '$lib/types/assets';
import type { Transfer } from '$lib/services/tokenTransfers';

export interface LPStatistics {
	totalTokenAAdded: number;
	totalTokenBAdded: number;
	totalTokenARemoved: number;
	totalTokenBRemoved: number;
	profitLossA: number;
	profitLossB: number;
	profitLossPercentA: number;
	profitLossPercentB: number;
	totalProfitLossA: number;
	totalProfitLossB: number;
	totalProfitLossInA: number;
	totalProfitLossInB: number;
	totalProfitLossPercentInA: number;
	totalProfitLossPercentInB: number;
}

export function isLPToken(token: FungibleTokenType | LPToken): token is LPToken {
	return 'poolInfo' in token && token.poolInfo !== undefined;
}

// A plain decimal string in whole tokens as exact base units at `decimals`; null when it is
// not plain decimal or carries more fraction digits than `decimals` allows.
function toBaseUnits(value: string, decimals: number): bigint | null {
	if (!Number.isInteger(decimals) || decimals < 0) return null;
	const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
	if (!match) return null;
	const [, sign, whole, fraction = ''] = match;
	if (fraction.length > decimals) return null;
	const units = BigInt(whole + fraction.padEnd(decimals, '0'));
	return sign ? -units : units;
}

// A plain decimal string without trailing fraction zeros or a bare trailing point, as the
// amount column prints; exponent form (toFixed at 1e21 and above) passes through unchanged.
function trimFraction(value: string): string {
	if (!value.includes('.') || /e/i.test(value)) return value;
	const trimmed = value.replace(/0+$/, '').replace(/\.$/, '');
	return trimmed === '-0' ? '0' : trimmed;
}

// Base units as a whole-token string at `decimals`, without trailing fraction zeros.
function formatBaseUnits(units: bigint, decimals: number): string {
	const sign = units < 0n ? '-' : '';
	const digits = (units < 0n ? -units : units).toString().padStart(decimals + 1, '0');
	if (decimals === 0) return sign + digits;
	return trimFraction(`${sign}${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`);
}

function startBalanceUnits(token: FungibleTokenType | LPToken): bigint | null {
	if (typeof token.balanceRaw === 'string' && /^-?\d+$/.test(token.balanceRaw.trim())) {
		return BigInt(token.balanceRaw.trim());
	}
	return Number.isSafeInteger(token.balance) ? BigInt(token.balance) : null;
}

function exactRunningBalance(
	index: number,
	token: FungibleTokenType | LPToken,
	filteredTransfers: Transfer[],
	walletId: string
): string | null {
	if (!Number.isInteger(token.decimals) || token.decimals < 0) return null;
	let balance = startBalanceUnits(token);
	if (balance === null) return null;
	for (let i = 0; i < index; i++) {
		const t = filteredTransfers[i];
		const amount = toBaseUnits(String(t.amount), token.decimals);
		if (amount === null) return null;
		if (t.type === 'fee') {
			balance += amount;
		} else if (t.to === walletId) {
			balance -= amount;
		} else if (t.from === walletId) {
			balance += amount;
		}
	}
	return formatBaseUnits(balance, token.decimals);
}

export function calculateRunningBalance(
	index: number,
	token: FungibleTokenType | LPToken,
	filteredTransfers: Transfer[],
	walletId: string
): string {
	// Exact base units when the balance and every newer amount parse; otherwise the number path
	const exact = exactRunningBalance(index, token, filteredTransfers, walletId);
	if (exact !== null) return exact;

	// Start with current balance in decimal form
	let runningBalance = Number(token.balance) / Math.pow(10, token.decimals);

	// Go through all newer transactions (from 0 to current index-1)
	// and reverse their effects to get the historical balance
	for (let i = 0; i < index; i++) {
		const t = filteredTransfers[i];
		const amount = Number(t.amount);

		// When going backwards in time:
		// 1. If we received money after this point, we need to subtract it to get the historical balance
		// 2. If we sent money after this point, we need to add it back to get the historical balance
		// 3. If we paid fees after this point, we need to add them back to get the historical balance
		if (t.type === 'fee') {
			runningBalance += amount; // Add back fees that were paid after this point
		} else if (t.to === walletId) {
			runningBalance -= amount; // Subtract money we received after this point
		} else if (t.from === walletId) {
			runningBalance += amount; // Add back money we sent after this point
		}
	}

	return trimFraction(runningBalance.toFixed(token.decimals));
}

export function formatChange(
	transfer: Transfer,
	token: FungibleTokenType | LPToken,
	walletId: string
): string {
	// Amount is already in decimal form; format it exactly when it is a plain decimal string
	const units = toBaseUnits(String(transfer.amount), token.decimals);
	const formatted =
		units === null
			? trimFraction(Number(transfer.amount).toFixed(token.decimals))
			: formatBaseUnits(units, token.decimals);
	if (transfer.type === 'fee') {
		return `-${formatted}`; // Fees are always negative
	}
	if (transfer.to === walletId) {
		return `+${formatted}`;
	}
	if (transfer.from === walletId) {
		return `-${formatted}`;
	}
	return formatted;
}

export function calculateLPStatistics(
	transfers: Transfer[],
	token: FungibleTokenType | LPToken,
	currentPoolBalance: { tokenA: number; tokenB: number } | null
) {
	if (!isLPToken(token) || !token.poolInfo) return;

	const stats: Partial<LPStatistics> = {};
	try {
		// Reset totals
		stats.totalTokenAAdded = 0;
		stats.totalTokenBAdded = 0;
		stats.totalTokenARemoved = 0;
		stats.totalTokenBRemoved = 0;

		// Process all transfers to calculate totals
		for (const transfer of transfers) {
			if (transfer.isLpExchange && transfer.exchangedTokens) {
				const { tokenA, tokenB } = transfer.exchangedTokens;

				if (transfer.lpExchangeType === 'add') {
					// Adding liquidity - user provided these tokens
					if (tokenA && tokenA.amount !== 'Unknown') {
						try {
							const amount = parseFloat(tokenA.amount);
							stats.totalTokenAAdded += amount;
						} catch (e) {
							console.error('Error parsing tokenA amount:', tokenA.amount, e);
						}
					}
					if (tokenB && tokenB.amount !== 'Unknown') {
						try {
							const amount = parseFloat(tokenB.amount);
							stats.totalTokenBAdded += amount;
						} catch (e) {
							console.error('Error parsing tokenB amount:', tokenB.amount, e);
						}
					}
				} else if (transfer.lpExchangeType === 'remove') {
					// Removing liquidity - user received these tokens back
					if (tokenA && tokenA.amount !== 'Unknown') {
						try {
							const amount = parseFloat(tokenA.amount);
							stats.totalTokenARemoved += amount;
						} catch (e) {
							console.error('Error parsing tokenA amount:', tokenA.amount, e);
						}
					}
					if (tokenB && tokenB.amount !== 'Unknown') {
						try {
							const amount = parseFloat(tokenB.amount);
							stats.totalTokenBRemoved += amount;
						} catch (e) {
							console.error('Error parsing tokenB amount:', tokenB.amount, e);
						}
					}
				}
			}
		}

		// Calculate profit/loss if we have current pool balance
		if (currentPoolBalance) {
			// Net contribution (what user put in minus what they took out)
			const netContributionA = stats.totalTokenAAdded - stats.totalTokenARemoved;
			const netContributionB = stats.totalTokenBAdded - stats.totalTokenBRemoved;

			// Current value minus net contribution = profit/loss
			stats.profitLossA = currentPoolBalance.tokenA - netContributionA;
			stats.profitLossB = currentPoolBalance.tokenB - netContributionB;

			// Calculate total profit/loss (including tokens already removed)
			// Total P/L = Current value + Total removed - Total added
			stats.totalProfitLossA =
				currentPoolBalance.tokenA + stats.totalTokenARemoved - stats.totalTokenAAdded;
			stats.totalProfitLossB =
				currentPoolBalance.tokenB + stats.totalTokenBRemoved - stats.totalTokenBAdded;

			// Calculate percentage profit/loss
			if (netContributionA > 0) {
				stats.profitLossPercentA = (stats.profitLossA / netContributionA) * 100;
			} else {
				stats.profitLossPercentA = 0;
			}

			if (netContributionB > 0) {
				stats.profitLossPercentB = (stats.profitLossB / netContributionB) * 100;
			} else {
				stats.profitLossPercentB = 0;
			}

			// Calculate the ratio between token A and token B in the pool
			// This ratio represents the current exchange rate between the tokens
			let exchangeRateAtoB = 0;
			let exchangeRateBtoA = 0;

			if (currentPoolBalance.tokenA > 0 && currentPoolBalance.tokenB > 0) {
				exchangeRateAtoB = currentPoolBalance.tokenB / currentPoolBalance.tokenA;
				exchangeRateBtoA = currentPoolBalance.tokenA / currentPoolBalance.tokenB;

				// Calculate total P/L converted to token A
				// This is: P/L in token A + (P/L in token B converted to token A)
				stats.totalProfitLossInA =
					stats.totalProfitLossA + stats.totalProfitLossB * exchangeRateBtoA;

				// Calculate total P/L converted to token B
				// This is: P/L in token B + (P/L in token A converted to token B)
				stats.totalProfitLossInB =
					stats.totalProfitLossB + stats.totalProfitLossA * exchangeRateAtoB;

				// Calculate percentage profit/loss for the converted values
				const totalInvestedInA = stats.totalTokenAAdded + stats.totalTokenBAdded * exchangeRateBtoA;
				const totalInvestedInB = stats.totalTokenBAdded + stats.totalTokenAAdded * exchangeRateAtoB;

				if (totalInvestedInA > 0) {
					stats.totalProfitLossPercentInA = (stats.totalProfitLossInA / totalInvestedInA) * 100;
				}

				if (totalInvestedInB > 0) {
					stats.totalProfitLossPercentInB = (stats.totalProfitLossInB / totalInvestedInB) * 100;
				}
			}
		}
	} catch (error) {
		console.error('Error calculating LP statistics:', error);
	}
	return stats;
}

// User's share of the pool (0-1). Balance and supply are both LP base units, for
// Humble as for Nomadex (TASK-97).
export function calculateUserPoolShare(token: FungibleTokenType | LPToken): number {
	if (!isLPToken(token) || !token.poolInfo) return 0;
	const balance = Number(token.balance);
	// An unread supply (null) gives no share.
	const totalSupply = Number(token.poolInfo.totalSupply ?? 0);
	return totalSupply > 0 && balance > 0 ? balance / totalSupply : 0;
}

// The user's share of each pool reserve in whole tokens. Reserves are base units.
export function calculateUserPoolAmounts(token: FungibleTokenType | LPToken): {
	tokenA: number;
	tokenB: number;
} {
	const share = calculateUserPoolShare(token);
	if (!isLPToken(token) || !(share > 0)) return { tokenA: 0, tokenB: 0 };
	const { tokABalance, tokBBalance, tokADecimals, tokBDecimals } = token.poolInfo;
	const amount = (reserve: string, decimals: number) => {
		const value = (share * Number(reserve)) / Math.pow(10, decimals);
		return Number.isFinite(value) ? value : 0;
	};
	return { tokenA: amount(tokABalance, tokADecimals), tokenB: amount(tokBBalance, tokBDecimals) };
}
