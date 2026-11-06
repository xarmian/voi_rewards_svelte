import { expect, test } from 'vitest';
import { buildScheduleCsv, scheduleRows } from './calculatorSchedule';

const startDate = new Date('2024-10-30T00:00:00Z');

test('CSV preserves the existing header, ISO dates, inclusive end dates and rounding', () => {
	expect(buildScheduleCsv([100.4, 205.5, 309.9], startDate)).toBe(
		'startDate,endDate,nodeAamount,relayAmount\n' +
			'2024-10-30,2024-11-05,100,10\n' +
			'2024-11-06,2024-11-12,206,21\n' +
			'2024-11-13,2024-11-19,310,31'
	);
	expect(startDate.toISOString()).toBe('2024-10-30T00:00:00.000Z');
});

test('the 52 visible schedule pools and dates match their rows in the 1040-epoch CSV', () => {
	const amounts = Array.from({ length: 1040 }, (_, epoch) => 3_000_000 * 0.997 ** epoch);
	const csv = buildScheduleCsv(amounts, startDate).split('\n');
	expect(csv).toHaveLength(1041);
	for (const currentEpochNumber of [0, 105, 988]) {
		const now = new Date(startDate);
		now.setUTCDate(now.getUTCDate() + currentEpochNumber * 7 + 2);
		const rows = scheduleRows(
			amounts.slice(currentEpochNumber, currentEpochNumber + 52),
			currentEpochNumber,
			startDate,
			now
		);
		expect(rows).toHaveLength(52);
		for (const [i, row] of rows.entries()) {
			expect(row.epochNumber).toBe(currentEpochNumber + i);
			expect(row.isCurrent).toBe(i === 0);
			expect(csv[row.epochNumber + 1].split(',')).toEqual([
				row.startDate.toISOString().split('T')[0],
				row.endDate.toISOString().split('T')[0],
				String(Math.round(row.rewardPool)),
				String(Math.round(row.rewardPool / 10))
			]);
		}
	}
});

test('schedule preserves the legacy 52 rows and zero fallback for missing pools', () => {
	const rows = scheduleRows([123], 0, startDate, startDate);
	expect(rows).toHaveLength(52);
	expect(rows[0].rewardPool).toBe(123);
	expect(rows[1].rewardPool).toBe(0);
	expect(rows[0].isCurrent).toBe(true);
});
