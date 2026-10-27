import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { trackScrollLeft } from './scroll';

describe('active nav link visibility', () => {
	const track = { scrollLeft: 100, clientWidth: 200 };
	test('a fully visible link leaves the track unchanged', () => {
		assert.equal(trackScrollLeft(track, { offsetLeft: 150, offsetWidth: 100 }), 100);
		assert.equal(trackScrollLeft(track, { offsetLeft: 100, offsetWidth: 200 }), 100);
	});
	test('a link cut off on the left aligns its left edge', () => {
		assert.equal(trackScrollLeft(track, { offsetLeft: 80, offsetWidth: 100 }), 80);
	});
	test('a link cut off on the right aligns its right edge', () => {
		assert.equal(trackScrollLeft(track, { offsetLeft: 250, offsetWidth: 100 }), 150);
	});
	test('a link wider than the track aligns its left edge', () => {
		for (const offsetLeft of [80, 150, 350]) {
			assert.equal(trackScrollLeft(track, { offsetLeft, offsetWidth: 250 }), offsetLeft);
		}
	});
});
