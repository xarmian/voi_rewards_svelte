import { test } from 'vitest';
import assert from 'node:assert/strict';
import { makeX, makeY, tickValues } from './scales';
import type { XSpec } from './types';
test('band starts and bandwidth use inner padding .25', () => {
	const x = makeX({ kind: 'band', values: [1, 2, 3] }, [10, 120]);
	assert.equal(x.position(1), 10);
	assert.equal(x.position(2), 50);
	assert.equal(x.bandwidth, 30);
	assert.ok(Number.isNaN(x.position(4)));
});
test('continuous domain ends map to range ends', () => {
	const linear = makeX({ kind: 'linear', domain: [10, 20] }, [30, 300]);
	assert.equal(linear.position(10), 30);
	assert.equal(linear.position(20), 300);
	const time = makeX(
		{ kind: 'time', domain: [new Date('2026-10-01'), new Date('2026-10-31')] },
		[30, 300]
	);
	assert.equal(time.position('2026-10-01'), 30);
	assert.equal(time.position(new Date('2026-10-31')), 300);
	const y = makeY([0, 97], [200, 10]);
	assert.equal(y(0), 200);
	assert.equal(y(100), 10);
});
for (const width of [320, 1440])
	test(`ticks stay at least 44px apart at ${width}px`, () => {
		const specs: XSpec[] = [
			{ kind: 'band', values: Array.from({ length: 104 }, (_, i) => i) },
			{ kind: 'linear', domain: [0, 103] },
			{ kind: 'time', domain: [new Date('2026-09-25'), new Date('2026-10-25')] }
		];
		for (const spec of specs) {
			const x = makeX(spec, [0, width]);
			const ticks = tickValues(x, width);
			assert.ok(ticks.length > 1);
			for (let i = 1; i < ticks.length; i++)
				assert.ok(x.position(ticks[i]) - x.position(ticks[i - 1]) >= 44 - 1e-8);
		}
	});

test('log scale maps equal ratios to equal distances and rejects nonpositive samples', () => {
	const y = makeY([0.0001, 0.01], [200, 0], 'log');
	assert.ok(Math.abs(y(0.001) - y(0.0001) - (y(0.01) - y(0.001))) < 1e-8);
	for (const value of [0, -1, NaN, Infinity]) assert.ok(Number.isNaN(y(value)));
	assert.throws(() => makeY([0, 1], [200, 0], 'log'));
	assert.throws(() => makeY([-1, 1], [200, 0], 'log'));
	assert.ok(y.ticks(4).every((value) => value > 0));
});

test('a narrow log domain keeps its extent and a wide one gets a short readable tick list', () => {
	const narrow = makeY([0.000121, 0.000127], [200, 0], 'log');
	assert.ok(narrow(0.000121) > 150 && narrow(0.000127) < 50, 'the data fills the plot');
	const ticks = narrow.ticks(4);
	assert.ok(ticks.length >= 1 && ticks.length <= 5);
	assert.ok(ticks.every((value) => value >= 0.000121 && value <= 0.000127));
	assert.ok(makeY([0.0001, 0.1], [200, 0], 'log').ticks(4).length <= 5);
});

test('a wider minimum gap spaces long band labels further apart', () => {
	const values = Array.from({ length: 30 }, (_, i) =>
		new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)
	);
	const x = makeX({ kind: 'band', values }, [0, 330]);
	const ticks = tickValues(x, 330, 78);
	assert.ok(ticks.length > 1);
	for (let i = 1; i < ticks.length; i++)
		assert.ok(x.position(ticks[i]) - x.position(ticks[i - 1]) >= 78 - 1e-8);
});

const isMidnight = (value: number | string | Date) =>
	value instanceof Date && value.getTime() % 86400000 === 0;
test('a multi-day time axis at a desktop width ticks only at UTC midnight, each date once', () => {
	const plotWidth = 1360;
	const x = makeX(
		{ kind: 'time', domain: [new Date('2026-10-25T00:00Z'), new Date('2026-11-01T00:00Z')] },
		[0, plotWidth]
	);
	const ticks = tickValues(x, plotWidth);
	assert.ok(ticks.length > 1);
	assert.ok(ticks.every(isMidnight), ticks.map((t) => (t as Date).toISOString()).join());
	const days = ticks.map((t) => (t as Date).toISOString().slice(0, 10));
	assert.equal(new Set(days).size, days.length);
});
test('a one-day time axis keeps sub-day ticks', () => {
	const x = makeX(
		{ kind: 'time', domain: [new Date('2026-10-30T00:00Z'), new Date('2026-10-31T00:00Z')] },
		[0, 1360]
	);
	assert.ok(tickValues(x, 1360).some((t) => !isMidnight(t)));
});
test('a multi-day time axis falls back to daily midnights when the hint gives under two ticks', () => {
	const x = makeX(
		{ kind: 'time', domain: [new Date('2026-10-30T06:00Z'), new Date('2026-11-01T18:00Z')] },
		[0, 40]
	);
	assert.deepEqual(
		x.ticks(1).map((t) => (t as Date).toISOString()),
		['2026-10-31T00:00:00.000Z', '2026-11-01T00:00:00.000Z']
	);
});
