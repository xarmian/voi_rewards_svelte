import { test } from 'vitest';
import assert from 'node:assert/strict';
import { classify, ratioLabel } from './bars';
test('classifies strict thresholds and labels ratios', () => {
	assert.equal(classify(24840, 16827.19), 'hi');
	assert.equal(ratioLabel(24840, 16827.19), '148%');
	assert.equal(classify(115, 100), null);
	assert.equal(classify(85, 100), null);
	assert.equal(classify(84, 100), 'warn');
});
test('invalid ratios are unclassified', () => {
	for (const [value, expected] of [
		[1, 0],
		[1, -1],
		[NaN, 100],
		[100, NaN],
		[Infinity, 100],
		[100, Infinity]
	])
		assert.equal(classify(value, expected), null);
});
