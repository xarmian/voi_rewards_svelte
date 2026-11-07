import { expect, it, vi } from 'vitest';
import { activateRowChart } from './rowChart';

type Node = {
	closest: (selector: string) => Node | null;
	querySelector?: (selector: string) => { click: () => void } | null;
};
const cell = (button: { click: () => void } | null, interactive = false) => {
	const row: Node = { closest: () => null, querySelector: () => button };
	const target: Node = {
		closest: (selector) => (selector === 'tr' ? row : interactive ? target : null)
	};
	return target as unknown as EventTarget;
};

it('opens the chart of the row whose plain cell was clicked', () => {
	const click = vi.fn();
	expect(activateRowChart(cell({ click }))).toBe(true);
	expect(click).toHaveBeenCalledTimes(1);
});
it('leaves clicks on links, buttons and form controls to those controls', () => {
	const click = vi.fn();
	expect(activateRowChart(cell({ click }, true))).toBe(false);
	expect(click).not.toHaveBeenCalled();
});
it('ignores rows without a chart button and targets that are not elements', () => {
	expect(activateRowChart(cell(null))).toBe(false);
	expect(activateRowChart(null)).toBe(false);
	expect(activateRowChart({} as EventTarget)).toBe(false);
});
