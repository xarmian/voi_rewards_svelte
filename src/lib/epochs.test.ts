import { test } from 'vitest';
import assert from 'node:assert/strict';
import { epochAt, epochRange } from './epochs';

for (const [date, epoch] of [
	['2026-10-24', 104],
	['2024-10-30T00:00:00Z', 1],
	['2026-10-21T00:00:00Z', 104],
	['2026-10-20T23:59:00Z', 103]
] as const) {
	test(`epoch at ${date}`, () => assert.equal(epochAt(new Date(date)), epoch));
}
test('legacy range ids and UTC labels', () => {
	const range = epochRange(104);
	assert.equal(range.id, '20261021-20261027');
	assert.equal(range.label, 'Oct 21 – Oct 27, 2026');
	assert.equal(range.start.toISOString(), '2026-10-21T00:00:00.000Z');
	assert.equal(range.end.toISOString(), '2026-10-27T23:59:59.999Z');
	assert.equal(epochRange(1).id, '20241030-20241105');
});
for (const epoch of [1, 52, 104]) {
	test(`epoch ${epoch} includes both UTC boundaries`, () => {
		const { start, end } = epochRange(epoch);
		assert.equal(epochAt(start), epoch);
		assert.equal(epochAt(end), epoch);
	});
}

test('an epoch spanning New Year includes both years in its label', () => {
	const epoch = epochAt(new Date('2027-01-01T00:00:00Z'));
	assert.equal(epoch, 114);
	const range = epochRange(epoch);
	assert.equal(range.id, '20261230-20270105');
	assert.equal(range.label, 'Dec 30, 2026 – Jan 5, 2027');
});
