import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { sparklinePath } from './geometry';

describe('sparkline geometry', () => {
	test('non-finite samples are dropped before scaling', () => {
		assert.deepEqual(
			sparklinePath([NaN, 2, Infinity, 8, -Infinity, 3, 9, NaN], 240, 44, 4),
			sparklinePath([2, 8, 3, 9], 240, 44, 4)
		);
	});
	test('all non-finite samples produce empty geometry', () => {
		assert.deepEqual(sparklinePath([NaN, Infinity, -Infinity], 240, 44, 4), {
			line: '',
			area: '',
			end: null
		});
	});
	for (const values of [[2, 8, 3, 9], [7], [4, 4, 4], []]) {
		test(`finite paths for ${JSON.stringify(values)}`, () => {
			const result = sparklinePath(values, 240, 44, 4);
			assert.doesNotMatch(result.line + result.area, /NaN|Infinity/);
			if (values.length) {
				assert.equal(result.end?.x, 236);
				assert.match(result.line, /236,/);
				if (values.every((v) => v === values[0])) assert.equal(result.end?.y, 22);
			} else {
				assert.equal(result.line, '');
				assert.equal(result.area, '');
				assert.equal(result.end, null);
			}
		});
	}
});
