import { expect, test } from 'vitest';
import { createFlowPin } from './flowAccount';

test('follows selection until pinned, then keeps the starting account through switches and disconnects', () => {
	const flow = createFlowPin();
	expect(flow.pinned).toBe(false);
	expect(flow.address).toBeUndefined();
	expect(flow.current(undefined)).toBeUndefined();
	expect(flow.current('A')).toBe('A');
	flow.pin('A');
	expect(flow.pinned).toBe(true);
	expect(flow.address).toBe('A');
	expect(flow.current('B')).toBe('A');
	expect(flow.current(undefined)).toBe('A');
});

test('a second pin replaces the first; release returns to the current selection', () => {
	const flow = createFlowPin();
	flow.pin('A');
	flow.pin('B');
	expect(flow.address).toBe('B');
	expect(flow.current('C')).toBe('B');
	flow.release();
	expect(flow.pinned).toBe(false);
	expect(flow.address).toBeUndefined();
	expect(flow.current('C')).toBe('C');
	expect(flow.current(undefined)).toBeUndefined();
	flow.release();
	flow.pin('D');
	expect(flow.current('C')).toBe('D');
});
