type ElementLike = {
	closest?: (selector: string) => ElementLike | null;
	querySelector?: (selector: string) => { click: () => void } | null;
};

const CONTROLS = 'a, button, input, select, textarea, summary, [role="button"]';

/**
 * A click on a plain part of a market row opens that row's chart by pressing the row's own
 * chart button, so the pointer shortcut and the button share one handler. Clicks on links and
 * controls are left to those controls.
 */
export function activateRowChart(target: EventTarget | null): boolean {
	const element = target as ElementLike | null;
	if (!element || typeof element.closest !== 'function') return false;
	if (element.closest(CONTROLS)) return false;
	const button = element.closest('tr')?.querySelector?.('[data-market-chart]');
	if (!button) return false;
	button.click();
	return true;
}
