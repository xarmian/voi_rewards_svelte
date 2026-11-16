import { describe, expect, it } from 'vitest';
import {
	FORECAST_ASSUMPTIONS,
	FORECAST_PERIOD_SECONDS,
	forecastBlockRewards,
	networkPace,
	PACE_REQUEST_DAYS,
	type ForecastInput
} from './blockRewardForecast';

const base: ForecastInput = {
	stake: 30_000e6,
	onlineStake: 739.56e6 * 1e6,
	blockTime: 2.77,
	bonus: 5_000_000,
	avgFees: 0,
	round: 30_000_000,
	seconds: FORECAST_PERIOD_SECONDS.day,
	eligible: true
};
const forecast = (overrides: Partial<ForecastInput> = {}) =>
	forecastBlockRewards({ ...base, ...overrides });

describe('forecastBlockRewards', () => {
	it('gives a zero chance over a zero-length period, even at the whole online stake', () => {
		const result = forecast({ stake: 50_000_000e6, onlineStake: 50_000_000e6, seconds: 0 })!;
		expect(result.chance).toBe(0);
		expect(result.expectedCount).toBe(0);
	});

	it('matches the 30,000 VOI daily check', () => {
		const result = forecast()!;
		expect(result.expectedCount).toBeCloseTo(1.265, 3);
		// 1 - exp(-1.26527) = 0.71784
		expect(result.chance).toBeCloseTo(0.718, 3);
		expect(result.range).toEqual([0, 3]);
		expect(result.expectedMicroVoi).toBeCloseTo(result.expectedCount * base.bonus, 0);
	});

	it('is near certain for 1M VOI over a day', () => {
		expect(forecast({ stake: 1_000_000e6 })!.chance).toBeGreaterThanOrEqual(0.999);
	});

	it('computes the percentile range for a large mean without underflow', () => {
		// stake/online = 1e-3, N = 900,000 rounds -> lambda = 900
		const result = forecast({
			stake: 1e12,
			onlineStake: 1e15,
			blockTime: 1,
			seconds: 900_000
		})!;
		expect(result.expectedCount).toBeCloseTo(900, 6);
		expect(Math.abs(result.range[0] - (900 - 38))).toBeLessThanOrEqual(2);
		expect(Math.abs(result.range[1] - (900 + 38))).toBeLessThanOrEqual(2);
	});

	it('uses the normal approximation above a mean of 1000', () => {
		const result = forecast({
			stake: 1e12,
			onlineStake: 1e15,
			blockTime: 1,
			seconds: 5_000_000
		})!;
		const spread = 1.2816 * Math.sqrt(5000);
		expect(result.range).toEqual([Math.round(5000 - spread), Math.round(5000 + spread)]);
	});

	it('decays the bonus across a million-round boundary', () => {
		const stake = 1e12;
		const onlineStake = 1e15;
		const p = stake / onlineStake;
		const b = 5_000_000;
		const fees = 1_001;
		const input = {
			stake,
			onlineStake,
			blockTime: 1,
			bonus: b,
			avgFees: fees,
			round: 24_999_000,
			seconds: 2000
		};
		const result = forecast(input)!;
		// Rounds 24,999,001..24,999,999 (999) at b, 25,000,000..25,001,000 (1001) at 0.99 b.
		const share = Math.floor((fees * 50) / 100);
		const expected = p * (999 * (b + share) + 1001 * (b * 0.99 + share));
		expect(result.expectedMicroVoi).toBeCloseTo(expected, 6);
		expect(forecast({ ...input, avgFees: 0 })!.expectedMicroVoi).toBeLessThan(b * 2000 * p);
	});

	it('counts a fractional last segment', () => {
		const result = forecast({
			stake: 1e12,
			onlineStake: 1e15,
			blockTime: 1,
			bonus: 1_000_000,
			round: 24_999_999,
			seconds: 1.5
		})!;
		// Round 25,000,000 fully and half of 25,000,001, both at the decayed bonus.
		expect(result.expectedMicroVoi).toBeCloseTo(1e-3 * 1.5 * 990_000, 6);
	});

	it('returns null when the account cannot earn or inputs are invalid', () => {
		expect(forecast({ eligible: false })).toBeNull();
		expect(forecast({ stake: 29_999_999_999 })).toBeNull();
		expect(forecast({ stake: 70_000_000_000_001 })).toBeNull();
		expect(forecast({ stake: 70_000_000_000_000, onlineStake: 1e16 })).not.toBeNull();
		expect(forecast({ onlineStake: 0 })).toBeNull();
		expect(forecast({ blockTime: 0 })).toBeNull();
		expect(forecast({ bonus: Number.NaN })).toBeNull();
		expect(forecast({ seconds: Number.POSITIVE_INFINITY })).toBeNull();
	});

	it('exports the periods and assumptions', () => {
		expect(FORECAST_PERIOD_SECONDS).toEqual({
			day: 86400,
			week: 7 * 86400,
			month: 30.44 * 86400,
			year: 365.25 * 86400
		});
		expect(FORECAST_ASSUMPTIONS).not.toMatch(/payout/i);
	});
});

describe('networkPace', () => {
	const days = (start: number, count: number) =>
		Array.from({ length: count }, (_, index) => ({
			day: `2026-11-${String(start + index).padStart(2, '0')}`,
			blocks: 30_000,
			feesCollected: 3_000_000
		}));
	const now = new Date('2026-11-16T08:00:00Z');

	it('uses the last seven complete days and excludes today', () => {
		const rows = [
			...days(1, 8),
			...days(9, 7),
			{ day: '2026-11-16', blocks: 1, feesCollected: 999_999_999 }
		];
		rows[0].blocks = 1;
		const pace = networkPace(rows, now)!;
		expect(pace.blockTime).toBeCloseTo((7 * 86400) / (7 * 30_000), 9);
		expect(pace.avgFees).toBeCloseTo(100, 9);
	});

	const today = { day: '2026-11-16', blocks: 5, feesCollected: 0 };

	it('reads rows in any order', () => {
		const rows = [today, ...days(9, 7)].reverse();
		rows[0].blocks = 60_000;
		const pace = networkPace(rows, now)!;
		expect(pace.blockTime).toBeCloseTo((7 * 86400) / (8 * 30_000), 9);
	});

	it('needs each of the seven days before today exactly once', () => {
		expect(networkPace([...days(10, 6), today], now)).toBeNull();
		expect(networkPace([...days(10, 6), days(10, 1)[0], today], now)).toBeNull();
		expect(networkPace([...days(8, 1), ...days(10, 6), today], now)).toBeNull();
		expect(networkPace([...days(9, 7), today], now)).not.toBeNull();
	});

	it('is null when a day inside the window appears twice', () => {
		const extra = { day: '2026-11-12', blocks: 1, feesCollected: 0 };
		expect(networkPace([...days(9, 7), extra, today], now)).toBeNull();
	});

	it('finds the seven days across a month and a year boundary', () => {
		const row = (day: string) => ({ day, blocks: 30_000, feesCollected: 0 });
		const december = ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'];
		expect(
			networkPace(
				[...december, '2026-12-01', '2026-12-02', '2026-12-03'].map(row),
				new Date('2026-12-03T00:00:01Z')
			)
		).not.toBeNull();
		const newYear = ['2026-12-25', '2026-12-26', '2026-12-27', '2026-12-28', '2026-12-29'];
		expect(
			networkPace(
				[...newYear, '2026-12-30', '2026-12-31', '2027-01-01'].map(row),
				new Date('2027-01-01T23:59:59Z')
			)
		).not.toBeNull();
	});

	it('is null until today has blocks, so a cut-short yesterday is not used', () => {
		expect(networkPace(days(9, 7), now)).toBeNull();
		expect(networkPace([...days(9, 7), { ...today, blocks: 0 }], now)).toBeNull();
	});

	it('requests enough days to include the seven complete ones and today', () => {
		expect(PACE_REQUEST_DAYS).toBe(8);
	});

	it('is null without blocks', () => {
		expect(
			networkPace([...days(9, 7).map((row) => ({ ...row, blocks: 0 })), today], now)
		).toBeNull();
	});
});
