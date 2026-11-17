import { describe, expect, it } from 'vitest';
import type { LPToken } from '$lib/types/assets';
import type { Transfer } from '$lib/services/tokenTransfers';
import {
	calculateLPStatistics,
	calculateUserPoolShare,
	calculateUserPoolAmounts,
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
		).toBe(0.1);
	});
	// TASK-97: Mimir serves Humble supply and reserves in base units, like Nomadex. Live
	// 2026-10-30, pool 40180060 (wVOI 6 / aBTC 8 decimals); truth was 57,897.54 VOI and
	// 0.000176 aBTC, while prod showed 0.017602 aBTC (100x) and 0.00% of pool.
	it('values a Humble LP with an 8-decimal side from base-unit reserves', () => {
		const abtc: LPToken = {
			...token,
			balance: 31238745,
			decimals: 6,
			poolInfo: {
				...token.poolInfo,
				provider: 'humble',
				tokABalance: '87625948837',
				tokBBalance: '26640',
				totalSupply: 47278775,
				tokADecimals: 6,
				tokBDecimals: 8
			}
		};
		expect(calculateUserPoolShare(abtc)).toBeCloseTo(31238745 / 47278775, 12);
		const amounts = calculateUserPoolAmounts(abtc);
		expect(amounts.tokenA).toBeCloseTo(57897.54, 2);
		expect(amounts.tokenB).toBeCloseTo(0.000176, 6);
	});
	it('values an 18-decimal side and returns zeros for an unheld LP', () => {
		const rocket: LPToken = {
			...token,
			balance: Number('69536883434672898'),
			decimals: 6,
			poolInfo: {
				...token.poolInfo,
				provider: 'humble',
				tokABalance: '5771393685',
				tokBBalance: '98706807154814757062881206',
				totalSupply: Number('695368834346728981'),
				tokADecimals: 6,
				tokBDecimals: 18
			}
		};
		const amounts = calculateUserPoolAmounts(rocket);
		expect(amounts.tokenA).toBeCloseTo(577.1393685, 4);
		expect(amounts.tokenB).toBeCloseTo(9870680.715, 1);
		expect(calculateUserPoolAmounts({ ...rocket, balance: 0 })).toEqual({ tokenA: 0, tokenB: 0 });
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

	it('formats a received amount above 2^53 at 0 decimals exactly', () => {
		const whole = { ...token, decimals: 0 };
		expect(formatChange({ ...transfer, amount: '9007199254740993' }, whole, 'wallet')).toBe(
			'+9007199254740993'
		);
	});
	it('formats 18-decimal amounts exactly with fixed fraction digits', () => {
		const wei = { ...token, decimals: 18 };
		const sent = { ...transfer, from: 'wallet', to: 'other' };
		expect(formatChange({ ...transfer, amount: '1234567.123456789012345678' }, wei, 'wallet')).toBe(
			'+1234567.123456789012345678'
		);
		expect(formatChange({ ...sent, amount: '0.5' }, wei, 'wallet')).toBe('-0.500000000000000000');
	});
	it('reverses a newer amount from a balance above 2^53 in base units', () => {
		const whole = {
			...token,
			decimals: 0,
			balance: Number('9007199254740993'),
			balanceRaw: '9007199254740993'
		};
		expect(
			calculateRunningBalance(1, whole, [{ ...transfer, amount: '1' }, transfer], 'wallet')
		).toBe('9007199254740992');
	});
	it('reverses an 18-decimal amount exactly where the number path rounds', () => {
		const wei = { ...token, decimals: 18, balance: 1e18, balanceRaw: '1000000000000000000' };
		const transfers = [{ ...transfer, amount: '0.1' }, transfer];
		expect((1 - 0.1).toFixed(18)).not.toBe('0.900000000000000000');
		expect(calculateRunningBalance(1, wei, transfers, 'wallet')).toBe('0.900000000000000000');
	});
	it('keeps the number path for an amount in exponent form', () => {
		const eight = { ...token, decimals: 8, balance: 100000000 };
		const odd = { ...transfer, amount: '1e-7' };
		expect(() => formatChange(odd, eight, 'wallet')).not.toThrow();
		expect(formatChange(odd, eight, 'wallet')).toBe(`+${Number('1e-7').toFixed(8)}`);
		expect(calculateRunningBalance(1, eight, [odd, transfer], 'wallet')).toBe(
			(100000000 / 1e8 - Number('1e-7')).toFixed(8)
		);
	});
	it('formats zero, negative and 0-decimal values without a trailing point', () => {
		const whole = { ...token, decimals: 0, balance: 0, balanceRaw: '0' };
		const other = { ...transfer, to: 'someone' };
		expect(formatChange({ ...transfer, amount: '0' }, whole, 'wallet')).toBe('+0');
		expect(formatChange({ ...other, amount: '-5' }, whole, 'wallet')).toBe('-5');
		expect(formatChange({ ...other, amount: '-0.5' }, token, 'wallet')).toBe('-0.50');
		expect(formatChange({ ...transfer, amount: '7' }, whole, 'wallet')).toBe('+7');
		expect(
			calculateRunningBalance(1, whole, [{ ...transfer, amount: '1' }, transfer], 'wallet')
		).toBe('-1');
	});
});
