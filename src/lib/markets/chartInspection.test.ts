import { expect, it } from 'vitest';
import { clearInspection, inspect, isInspectionKey } from './chartInspection';
const points = ['first observation', 'middle observation', 'last observation'];
it('handles zero and one observations', () => {
	for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape']) {
		expect(inspect(clearInspection(), { key }, [])).toEqual(clearInspection());
		const state = inspect(clearInspection(), { key }, ['only']);
		expect(state.index).toBe(key === 'Escape' ? null : 0);
	}
});
it('steps through many observations and clamps at both ends', () => {
	let state = clearInspection();
	state = inspect(state, { key: 'ArrowRight' }, points);
	expect(state).toEqual({ index: 0, announcement: points[0] });
	expect(inspect(state, { key: 'ArrowLeft' }, points).index).toBe(0);
	state = inspect(state, { key: 'ArrowRight' }, points);
	expect(state.index).toBe(1);
	state = inspect(state, { key: 'ArrowRight' }, points);
	expect(inspect(state, { key: 'ArrowRight' }, points).index).toBe(2);
	expect(inspect(state, { key: 'ArrowLeft' }, points).index).toBe(1);
	expect(inspect(clearInspection(), { key: 'ArrowLeft' }, points).index).toBe(2);
});
it('selects Home and End and clears on Escape', () => {
	const state = inspect(clearInspection(), { key: 'End' }, points);
	expect(state.index).toBe(2);
	expect(inspect(state, { key: 'Home' }, points).index).toBe(0);
	expect(inspect(state, { key: 'Escape' }, points)).toEqual(clearInspection());
	expect(inspect(state, { key: 'Tab' }, points)).toEqual(state);
	expect(isInspectionKey('Tab')).toBe(false);
	expect(isInspectionKey('Escape')).toBe(true);
});
it('pointer and keyboard select the same text but only keyboard announces', () => {
	const keyboard = inspect(clearInspection(), { key: 'End' }, points);
	const pointer = inspect(clearInspection(), { pointer: 2 }, points);
	expect(pointer.index).toBe(keyboard.index);
	expect(pointer.announcement).toBe('');
	expect(keyboard.announcement).toBe(points[pointer.index!]);
	expect(inspect(keyboard, { pointer: null }, points)).toEqual(clearInspection());
});
it('clears selection and announcements when chart inputs change', () => {
	const state = inspect(clearInspection(), { key: 'End' }, points);
	expect(inspect(state, { reset: true }, points)).toEqual(clearInspection());
});
