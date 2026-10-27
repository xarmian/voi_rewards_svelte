import { test } from 'vitest';
import assert from 'node:assert/strict';
import { chartEvents, annotationsFor } from './chartEvents';
test('offline event maps to epoch point and UTC date range', () => {
	const event = chartEvents.find((e) => e.id === 'offline-drop-2026-10');
	assert.ok(event);
	assert.equal(event.from, '2026-10-08');
	assert.equal(event.to, '2026-10-12');
	assert.match(event.long, /^Oct 8-12:/);
	const epoch = annotationsFor('blocksVsExpected', 'epoch');
	assert.equal(epoch.length, 1);
	assert.equal(epoch[0].at, 102);
	assert.equal(epoch[0].detail, event.long);
	assert.deepEqual(annotationsFor('onlineStake', 'date')[0].at, ['2026-10-08', '2026-10-12']);
	assert.equal(annotationsFor('apr', 'epoch')[0].tone, 'hi');
});
