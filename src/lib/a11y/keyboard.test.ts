import { describe, expect, it } from 'vitest';
import { ariaSortFor, leavesWidget, nextOptionIndex } from './keyboard';

describe('ariaSortFor', () => {
	it('exposes the direction only on the active column', () => {
		expect(ariaSortFor('price', 'price', 'asc')).toBe('ascending');
		expect(ariaSortFor('price', 'price', 'desc')).toBe('descending');
		expect(ariaSortFor('price', 'tvl', 'asc')).toBeUndefined();
		expect(ariaSortFor('price', 'tvl', 'desc')).toBeUndefined();
	});
});

describe('leavesWidget', () => {
	it('keeps focus within the widget and closes for outside or missing targets', () => {
		const inside = {};
		const container = { contains: (node: unknown) => node === inside || node === container };
		expect(leavesWidget(container, inside)).toBe(false);
		expect(leavesWidget(container, container)).toBe(false);
		expect(leavesWidget(container, {})).toBe(true);
		expect(leavesWidget(container, null)).toBe(true);
	});
});

describe('nextOptionIndex', () => {
	it.each([
		[-1, 3, 'ArrowDown', 0],
		[0, 3, 'ArrowDown', 1],
		[2, 3, 'ArrowDown', 2],
		[2, 3, 'ArrowUp', 1],
		[0, 3, 'ArrowUp', -1],
		[2, 3, 'Home', 0],
		[0, 3, 'End', 2],
		[1, 3, 'Tab', 1],
		[0, 1, 'ArrowDown', 0],
		[0, 1, 'ArrowUp', -1],
		[0, 1, 'Home', 0],
		[0, 1, 'End', 0],
		[-1, 0, 'ArrowDown', -1],
		[-1, 0, 'ArrowUp', -1],
		[-1, 0, 'Home', -1],
		[-1, 0, 'End', -1]
	])('moves from %i among %i options with %s to %i', (current, count, key, expected) => {
		expect(nextOptionIndex(current, count, key)).toBe(expected);
	});
});
