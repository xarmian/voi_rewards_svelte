import { describe, expect, it } from 'vitest';
import type { LPToken } from '$lib/types/assets';
import type { Transfer } from '$lib/services/tokenTransfers';
import {
	calculateLPStatistics,
	calculateUserPoolShare,
	calculateRunningBalance,
	formatChange
} from './lpStats';

const token: LPToken = {
	id: '1',
	contractId: '1',
	name: 'LP',
	symbol: 'LP',
	balance: 100,
	decimals: 2,
	verified: true,
	imageUrl: '',
	value: 0,
	type: 'arc200',
	poolInfo: {
		tokAId: '2',
		tokBId: '3',
		tokASymbol: 'A',
		tokBSymbol: 'B',
		tokABalance: '10000',
		tokBBalance: '20000',
		totalSupply: 1000,
		poolId: '4',
		apr: 0,
		tokADecimals: 2,
		tokBDecimals: 2,
		tvl: 0,
		provider: 'nomadex'
	}
};
const transfer: Transfer = {
	from: 'other',
	to: 'wallet',
	amount: '0.2',
	round: 1,
	timestamp: 1,
	transactionid: 'tx'
};
const exchanges: Transfer[] = [
	{
		...transfer,
		isLpExchange: true,
		lpExchangeType: 'add',
		exchangedTokens: {
			tokenA: { id: '2', symbol: 'A', amount: '100' },
			tokenB: { id: '3', symbol: 'B', amount: '200' }
		}
	},
	{
		...transfer,
		isLpExchange: true,
		lpExchangeType: 'remove',
		exchangedTokens: {
			tokenA: { id: '2', symbol: 'A', amount: '20' },
			tokenB: { id: '3', symbol: 'B', amount: '40' }
		}
	}
];

// Characterization of the moved calculations; omitted fields retain the modal's prior state.
describe('LP statistics', () => {
	it('totals an add followed by a remove without calculating P/L without a balance', () => {
		expect(calculateLPStatistics(exchanges, token, null)).toEqual({
			totalTokenAAdded: 100,
			totalTokenBAdded: 200,
			totalTokenARemoved: 20,
			totalTokenBRemoved: 40
		});
	});
	it('calculates token and combined P/L with a current balance', () => {
		expect(calculateLPStatistics(exchanges, token, { tokenA: 90, tokenB: 180 })).toMatchObject({
			profitLossA: 10,
			profitLossB: 20,
			profitLossPercentA: 12.5,
			profitLossPercentB: 12.5,
			totalProfitLossA: 10,
			totalProfitLossB: 20,
			totalProfitLossInA: 20,
			totalProfitLossInB: 40,
			totalProfitLossPercentInA: 10,
			totalProfitLossPercentInB: 10
		});
	});
	it('omits combined P/L when either pool balance is zero', () => {
		const stats = calculateLPStatistics(exchanges, token, { tokenA: 0, tokenB: 10 });
		expect(stats).toMatchObject({ profitLossA: -80, profitLossB: -150 });
		expect(stats).not.toHaveProperty('totalProfitLossInA');
	});
	it('returns zero, not NaN, for zero LP supply', () => {
		expect(
			calculateUserPoolShare({ ...token, poolInfo: { ...token.poolInfo, totalSupply: 0 } })
		).toBe(0);
		expect(calculateUserPoolShare(token)).toBe(0.1);
		expect(
			calculateUserPoolShare({ ...token, poolInfo: { ...token.poolInfo, provider: 'humble' } })
		).toBe(0.001);
	});
	it('reverses newer received, sent and fee amounts and formats their signs', () => {
		const sent = { ...transfer, from: 'wallet', to: 'other', amount: '0.3' };
		const fee: Transfer = { ...sent, type: 'fee', amount: '0.01' };
		const transfers = [transfer, sent, fee];
		expect(calculateRunningBalance(3, token, transfers, 'wallet')).toBe('1.11');
		expect(formatChange(transfer, token, 'wallet')).toBe('+0.20');
		expect(formatChange(sent, token, 'wallet')).toBe('-0.30');
		expect(formatChange(fee, token, 'wallet')).toBe('-0.01');
	});
});
