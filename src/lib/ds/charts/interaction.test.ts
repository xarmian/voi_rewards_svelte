import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { shownMark, stepMark } from './interaction';

describe('pointer and keyboard marks', () => {
	test('pointer leave preserves the keyboard position', () => {
		const active = stepMark('ArrowRight', 1, 4);
		assert.equal(shownMark(0, active), 0);
		assert.equal(shownMark(null, active), 2);
	});
	test('hover wins while present, including the first mark', () => {
		assert.equal(shownMark(0, 2), 0);
		assert.equal(shownMark(3, 2), 3);
		assert.equal(shownMark(null, null), null);
	});
});

describe('keyboard steps', () => {
	test('Home and End jump to the bounds', () => {
		assert.equal(stepMark('Home', 2, 4), 0);
		assert.equal(stepMark('End', 1, 4), 3);
	});
	test('the first Right starts at the first mark', () => {
		assert.equal(stepMark('ArrowRight', null, 4), 0);
	});
	test('the first Left starts at the last mark', () => {
		assert.equal(stepMark('ArrowLeft', null, 4), 3);
	});
	test('arrows move one mark and clamp at both ends', () => {
		assert.equal(stepMark('ArrowRight', 1, 4), 2);
		assert.equal(stepMark('ArrowLeft', 2, 4), 1);
		assert.equal(stepMark('ArrowLeft', 0, 4), 0);
		assert.equal(stepMark('ArrowRight', 3, 4), 3);
	});
	test('Escape, unrelated keys and empty plots have no next mark', () => {
		assert.equal(stepMark('Escape', 2, 4), null);
		assert.equal(stepMark('Tab', 2, 4), null);
		assert.equal(stepMark('Home', null, 0), null);
	});
});
