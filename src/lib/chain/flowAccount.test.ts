import { get } from 'svelte/store';
import { expect, test } from 'vitest';
import { createFlowPin, pinnedFlows } from './flowAccount';

test('pinnedFlows counts live pins across flows; a repeat pin or release counts once', () => {
	const one = createFlowPin();
	const two = createFlowPin();
	expect(get(pinnedFlows)).toBe(0);
	one.pin('A');
	one.pin('B');
	expect(get(pinnedFlows)).toBe(1);
	two.pin('C');
	expect(get(pinnedFlows)).toBe(2);
	one.release();
	one.release();
	expect(get(pinnedFlows)).toBe(1);
	two.release();
	expect(get(pinnedFlows)).toBe(0);
});

test('dispose (a modal destroyed mid-flow) drops the pin from the count but keeps the captured account', () => {
	const flow = createFlowPin();
	flow.pin('A');
	expect(get(pinnedFlows)).toBe(1);
	flow.dispose();
	expect(get(pinnedFlows)).toBe(0);
	expect(flow.address).toBe('A');
	expect(flow.current('B')).toBe('A');
	flow.dispose();
	flow.release();
	expect(get(pinnedFlows)).toBe(0);
});

test('a flow never pinned can be disposed without touching the count', () => {
	const flow = createFlowPin();
	flow.dispose();
	expect(get(pinnedFlows)).toBe(0);
});

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
