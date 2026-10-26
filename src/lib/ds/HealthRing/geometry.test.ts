import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { ringArc } from './geometry';

describe('health ring geometry', () => {
	for (const [value, total, fraction] of [
		[0, 16, 0],
		[3, 16, 3 / 16],
		[16, 16, 1],
		[20, 16, 1],
		[0, 0, 0],
		[-3, 16, 0]
	]) {
		test(`${value}/${total}`, () => {
			const result = ringArc(value, total);
			assert.equal(result.r, 49);
			assert.equal(result.circumference, 2 * Math.PI * 49);
			assert.ok(Math.abs(result.dashOffset - result.circumference * (1 - fraction)) < 1e-10);
		});
	}
});
