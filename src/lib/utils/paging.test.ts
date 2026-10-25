import { test } from 'vitest';
import assert from 'node:assert/strict';
import { clampPage } from './paging.ts';

test('an empty result set has page 1', () => {
	assert.equal(clampPage(3, 0, 20), 1);
});

test('a page past the end clamps to the last page', () => {
	assert.equal(clampPage(5, 21, 20), 2);
});

test('a page below 1 clamps to page 1', () => {
	assert.equal(clampPage(0, 60, 20), 1);
});

test('a page within the range stays unchanged', () => {
	assert.equal(clampPage(2, 60, 20), 2);
});

test('an empty or non-numeric page (a cleared number input binds null) gives page 1', () => {
	assert.equal(clampPage(null as unknown as number, 60, 20), 1);
	assert.equal(clampPage(Number.NaN, 60, 20), 1);
});
