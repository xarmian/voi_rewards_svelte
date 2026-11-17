import { test } from 'vitest';
import assert from 'node:assert/strict';
import { timeTickLabels } from './timeTicks';

const utc = (iso: string) => new Date(`${iso}Z`);
const monthDay = (date: Date) =>
	date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

test('daily ticks within one year keep the month and day label', () => {
	const ticks = Array.from({ length: 8 }, (_, i) => new Date(Date.UTC(2026, 9, 26 + i)));
	assert.deepEqual(timeTickLabels(ticks), ticks.map(monthDay));
	assert.deepEqual(timeTickLabels(ticks).slice(0, 2), ['Oct 26', 'Oct 27']);
});

test('six-monthly ticks over several years mark the year on each new year', () => {
	const ticks = ['2027-01-01', '2027-07-01', '2028-01-01', '2028-07-01', '2029-01-01'].map((d) =>
		utc(`${d}T00:00:00`)
	);
	assert.deepEqual(timeTickLabels(ticks), ['Jan 2027', 'Jul', 'Jan 2028', 'Jul', 'Jan 2029']);
});

test('the first month tick carries its year even mid-year', () => {
	const ticks = ['2026-07-01', '2027-01-01', '2027-07-01'].map((d) => utc(`${d}T00:00:00`));
	assert.deepEqual(timeTickLabels(ticks), ['Jul 2026', 'Jan 2027', 'Jul']);
});

test('yearly ticks read as the year alone', () => {
	const ticks = ['2027-01-01', '2028-01-01', '2029-01-01'].map((d) => utc(`${d}T00:00:00`));
	assert.deepEqual(timeTickLabels(ticks), ['2027', '2028', '2029']);
});

test('weekly ticks across a year boundary add the year to the first tick and the first of the new year', () => {
	const ticks = ['2026-12-13', '2026-12-20', '2026-12-27', '2027-01-03', '2027-01-10'].map((d) =>
		utc(`${d}T00:00:00`)
	);
	assert.deepEqual(timeTickLabels(ticks), [
		'Dec 13, 2026',
		'Dec 20',
		'Dec 27',
		'Jan 3, 2027',
		'Jan 10'
	]);
});

test('sub-day ticks read as times, with the date on the first tick and at midnight', () => {
	const ticks = Array.from({ length: 5 }, (_, i) => new Date(Date.UTC(2026, 9, 30, i * 6)));
	assert.deepEqual(timeTickLabels(ticks), ['Oct 30', '06:00', '12:00', '18:00', 'Oct 31']);
	const offset = [utc('2026-10-30T03:00:00'), utc('2026-10-30T09:00:00')];
	assert.deepEqual(timeTickLabels(offset), ['Oct 30', '09:00']);
});

test('no ticks give no labels and one tick gives its date', () => {
	assert.deepEqual(timeTickLabels([]), []);
	assert.deepEqual(timeTickLabels([utc('2026-10-30T00:00:00')]), ['Oct 30']);
});
