import { test } from 'vitest';
import assert from 'node:assert/strict';
import { layoutAnnotations } from './annotations';
test('labels anchor inward at both edges', () => {
	assert.deepEqual(layoutAnnotations([{ x: 5, width: 75 }], 300), [{ anchor: 'start', row: 0 }]);
	assert.deepEqual(layoutAnnotations([{ x: 280, width: 75 }], 300), [{ anchor: 'end', row: 0 }]);
});
test('collisions stack and separated labels share a row', () => {
	assert.deepEqual(
		layoutAnnotations(
			[
				{ x: 10, width: 80 },
				{ x: 50, width: 80 }
			],
			300
		).map((p) => p.row),
		[0, 1]
	);
	assert.deepEqual(
		layoutAnnotations(
			[
				{ x: 10, width: 80 },
				{ x: 150, width: 80 }
			],
			300
		).map((p) => p.row),
		[0, 0]
	);
});
