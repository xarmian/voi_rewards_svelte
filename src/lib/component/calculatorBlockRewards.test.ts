import { describe, expect, it } from 'vitest';
import {
	BLOCK_REWARD_FEE_NOTE,
	OUT_OF_RANGE_TEXT,
	calculatorBlockRewardInputs,
	createCalculatorBlockRewardsState,
	rateText,
	type CalculatorBlockRewardsState
} from './calculatorBlockRewards';
import type { NetworkBlockRewardDay } from '$lib/wallet/blockRewards';

const AS_OF = Date.parse('2026-11-16T12:00:00Z');
const ready = <T>(value: T) => ({ state: 'ready' as const, value, asOf: AS_OF });

/** Thirty days ending today; the seven complete days before today hold `weekBlocks` blocks. */
function networkRows(weekBlocks = 218_339): NetworkBlockRewardDay[] {
	const perDay = Math.floor(weekBlocks / 7);
	const today = Date.parse('2026-11-16T00:00:00Z');
	return Array.from({ length: 30 }, (_, i) => {
		const offset = 29 - i;
		const blocks = offset === 1 ? weekBlocks - perDay * 6 : perDay;
		return {
			day: new Date(today - offset * 86400000).toISOString().slice(0, 10),
			blocks,
			rewardedBlocks: blocks,
			amount: 0,
			feesCollected: 0,
			lastRound: offset === 0 ? 5_000_000 : null
		};
	});
}

function sources(
	overrides: Partial<CalculatorBlockRewardsState> = {}
): CalculatorBlockRewardsState {
	return {
		funding: ready({ funding: 'funded' as const, bonus: 5_000_000 }),
		network: ready(networkRows()),
		onlineStake: ready(739_560_000 * 1e6),
		lastRound: ready(5_000_000),
		...overrides
	};
}

describe('calculatorBlockRewardInputs', () => {
	it('forecasts a 30,000 VOI stake against 739.56M VOI online at 2.77 s blocks', () => {
		const result = calculatorBlockRewardInputs(30_000, sources());
		expect(result.kind).toBe('ready');
		if (result.kind !== 'ready') return;
		expect(result.stake).toBe(30_000_000_000);
		expect(result.day.expectedCount).toBeCloseTo(1.265, 2);
		expect(result.next24h.chance).toBeCloseTo(0.717, 2);
		expect(result.next7d.expectedCount).toBeCloseTo(1.265 * 7, 1);
		expect(result.month.expectedCount).toBeCloseTo(1.265 * 30.44, 0);
		expect(result.year.expectedCount).toBeCloseTo(1.265 * 365.25, -1);
		expect(result.day.expectedMicroVoi).toBeCloseTo(1.265 * 5_000_000, -4);
	});

	it('is out of range just outside the bounds and in range exactly on them', () => {
		expect(calculatorBlockRewardInputs(29_999.999999, sources()).kind).toBe('out-of-range');
		expect(calculatorBlockRewardInputs(70_000_000.000001, sources()).kind).toBe('out-of-range');
		expect(calculatorBlockRewardInputs(30_000, sources()).kind).toBe('ready');
		expect(calculatorBlockRewardInputs(70_000_000, sources()).kind).toBe('ready');
	});

	it('reports out of range while the sources are still loading', () => {
		expect(calculatorBlockRewardInputs(100, createCalculatorBlockRewardsState()).kind).toBe(
			'out-of-range'
		);
	});

	it('treats a missing, zero, negative or non-finite stake as invalid', () => {
		for (const stake of [0, -5, NaN, Infinity, null, undefined])
			expect(calculatorBlockRewardInputs(stake, sources()).kind).toBe('invalid-stake');
	});

	it('is loading while any source is loading and an error when one failed', () => {
		for (const key of ['funding', 'network', 'onlineStake', 'lastRound'] as const) {
			expect(
				calculatorBlockRewardInputs(30_000, sources({ [key]: { state: 'loading' } })).kind
			).toBe('loading');
			expect(
				calculatorBlockRewardInputs(30_000, sources({ [key]: { state: 'error', error: 'x' } })).kind
			).toBe('error');
		}
		expect(calculatorBlockRewardInputs(30_000, createCalculatorBlockRewardsState()).kind).toBe(
			'loading'
		);
	});

	it('is an error without a bonus or a recent network pace, with no fallback block time', () => {
		expect(
			calculatorBlockRewardInputs(
				30_000,
				sources({ funding: ready({ funding: 'unknown' as const, bonus: null }) })
			).kind
		).toBe('error');
		expect(
			calculatorBlockRewardInputs(30_000, sources({ network: ready(networkRows().slice(0, -1)) }))
				.kind
		).toBe('error');
	});

	it('forecasts while funding is paused', () => {
		expect(
			calculatorBlockRewardInputs(
				30_000,
				sources({ funding: ready({ funding: 'paused' as const, bonus: 5_000_000 }) })
			).kind
		).toBe('ready');
	});
});

describe('rateText', () => {
	it('reads the simple yearly rate with two decimals while funded', () => {
		const result = calculatorBlockRewardInputs(30_000, sources());
		if (result.kind !== 'ready') throw new Error('not ready');
		const rate = (result.year.expectedMicroVoi / result.stake) * 100;
		expect(rateText(result.year, result.stake)).toBe(`≈ ${rate.toFixed(2)}% a year while funded`);
		expect(
			rateText({ chance: 1, expectedCount: 1, range: [0, 2], expectedMicroVoi: 1_500_000 }, 100e6)
		).toBe('≈ 1.50% a year while funded');
	});

	it('never reads NaN or Infinity', () => {
		const year = { chance: 0, expectedCount: 0, range: [0, 0] as [number, number] };
		for (const [expectedMicroVoi, stake] of [
			[NaN, 1e6],
			[1e6, 0],
			[1e6, NaN],
			[Infinity, 1e6],
			[0, 0]
		])
			expect(rateText({ ...year, expectedMicroVoi }, stake)).not.toMatch(/NaN|Infinity|∞/);
	});
});

describe('calculator block reward wording', () => {
	it('states the bounds and the incentive fee', () => {
		expect(OUT_OF_RANGE_TEXT).toBe(
			'No real-time block rewards: stake must be between 30,000 and 70,000,000 VOI.'
		);
		expect(BLOCK_REWARD_FEE_NOTE).toBe(
			'Requires going online with the 2 VOI incentive fee. Staking contracts cannot pay it.'
		);
	});

	it('uses no payout wording', () => {
		const result = calculatorBlockRewardInputs(30_000, sources());
		if (result.kind !== 'ready') throw new Error('not ready');
		for (const text of [
			OUT_OF_RANGE_TEXT,
			BLOCK_REWARD_FEE_NOTE,
			rateText(result.year, result.stake)
		])
			expect(text).not.toMatch(/payout/i);
	});
});
