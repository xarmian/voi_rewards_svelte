import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { cellText, focusColumnIndex, sortRows, visibleRows } from './sort';
import type { Column } from './types';

type Row = { id: string; value: number | string | null | undefined };
const column: Column<Row> = {
	key: 'value',
	header: 'Value',
	priority: 1,
	sortable: true,
	sortValue: (r) => r.value
};
const ids = (rows: Row[]) => rows.map((r) => r.id);
describe('sortRows', () => {
	test('infinite values compare consistently (review r1)', () => {
		const rows = [
			{ id: 'inf-a', value: Infinity },
			{ id: 'one', value: 1 },
			{ id: 'inf-b', value: Infinity },
			{ id: 'neg', value: -Infinity }
		];
		assert.deepEqual(ids(sortRows(rows, column, 'asc')), ['neg', 'one', 'inf-a', 'inf-b']);
		assert.deepEqual(ids(sortRows(rows, column, 'desc')), ['inf-a', 'inf-b', 'one', 'neg']);
	});
	test('numeric directions are stable and do not mutate input', () => {
		const rows = [
			{ id: 'low', value: 2 },
			{ id: 'first', value: 10 },
			{ id: 'second', value: 10 }
		];
		assert.deepEqual(ids(sortRows(rows, column, 'asc')), ['low', 'first', 'second']);
		assert.deepEqual(ids(sortRows(rows, column, 'desc')), ['first', 'second', 'low']);
		assert.deepEqual(ids(rows), ['low', 'first', 'second']);
	});
	test('missing values sort last in both directions, retaining input order', () => {
		const rows = [
			{ id: 'null', value: null },
			{ id: 'high', value: 9 },
			{ id: 'undefined', value: undefined },
			{ id: 'nan', value: NaN },
			{ id: 'low', value: 1 }
		];
		assert.deepEqual(ids(sortRows(rows, column, 'asc')), [
			'low',
			'high',
			'null',
			'undefined',
			'nan'
		]);
		assert.deepEqual(ids(sortRows(rows, column, 'desc')), [
			'high',
			'low',
			'null',
			'undefined',
			'nan'
		]);
	});
	test('strings use numeric, case-insensitive collation', () => {
		const rows = [
			{ id: 'ten', value: 'A10' },
			{ id: 'two', value: 'a2' },
			{ id: 'tie', value: 'A2' }
		];
		assert.deepEqual(ids(sortRows(rows, column, 'asc')), ['two', 'tie', 'ten']);
		assert.deepEqual(ids(sortRows(rows, column, 'desc')), ['ten', 'two', 'tie']);
	});
});
describe('visibleRows', () => {
	const rows = [1, 2, 3];
	test('no limit or a limit covering all rows retains every row', () => {
		assert.deepEqual(visibleRows(rows, undefined, false), rows);
		assert.deepEqual(visibleRows(rows, 3, false), rows);
		assert.deepEqual(visibleRows(rows, 5, false), rows);
	});
	test('collapsed limits and expanded reveals all rows', () => {
		assert.deepEqual(visibleRows(rows, 2, false), [1, 2]);
		assert.deepEqual(visibleRows(rows, 2, true), rows);
	});
});

describe('cell helpers (review r1/r2)', () => {
	test('focus goes to the first priority-1 column, not a hidden one', () => {
		const c = (priority: 1 | 2 | 3) => ({ key: String(priority), header: 'h', priority });
		assert.equal(focusColumnIndex([c(3), c(2), c(1), c(1)]), 2);
		assert.equal(focusColumnIndex([c(1), c(3)]), 0);
	});
	test('missing values render as the em dash', () => {
		for (const v of [null, undefined, NaN]) assert.equal(cellText(v), '—');
		assert.equal(cellText(0), '0');
		assert.equal(cellText('A'), 'A');
	});
});
