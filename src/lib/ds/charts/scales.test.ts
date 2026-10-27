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
