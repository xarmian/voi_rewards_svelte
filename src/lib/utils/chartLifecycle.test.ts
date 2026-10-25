import { afterEach, expect, test, vi } from 'vitest';
import { createChartLifecycle } from './chartLifecycle';

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

test('dispose disconnects observers, removes listeners and disposes charts exactly once', () => {
	class ObserverStub {
		disconnect = vi.fn();
	}
	const themeObserver = new ObserverStub();
	const resizeObserver = new ObserverStub();
	const chart = { dispose: vi.fn() };
	const target = new EventTarget();
	const listener = vi.fn();
	const removeListener = vi.spyOn(target, 'removeEventListener');
	const lifecycle = createChartLifecycle();

	lifecycle.add(() => chart.dispose());
	lifecycle.add(() => themeObserver.disconnect());
	lifecycle.add(() => resizeObserver.disconnect());
	target.addEventListener('resize', listener);
	lifecycle.add(() => target.removeEventListener('resize', listener));
	target.dispatchEvent(new Event('resize'));
	expect(listener).toHaveBeenCalledTimes(1);

	lifecycle.dispose();
	lifecycle.dispose();
	target.dispatchEvent(new Event('resize'));
	expect(lifecycle.disposed).toBe(true);
	expect(themeObserver.disconnect).toHaveBeenCalledTimes(1);
	expect(resizeObserver.disconnect).toHaveBeenCalledTimes(1);
	expect(removeListener).toHaveBeenCalledExactlyOnceWith('resize', listener);
	expect(listener).toHaveBeenCalledTimes(1);
	expect(chart.dispose).toHaveBeenCalledTimes(1);
});

test('a deferred init scheduled before disposal never runs after it', () => {
	vi.useFakeTimers();
	const lifecycle = createChartLifecycle();
	const initialize = vi.fn();
	lifecycle.deferred(initialize, 100);
	lifecycle.dispose();
	expect(vi.getTimerCount()).toBe(0);
	vi.runAllTimers();
	expect(initialize).not.toHaveBeenCalled();
});

test('a zero-width retry can run while alive and its next attempt is cancelled on dispose', () => {
	vi.useFakeTimers();
	const lifecycle = createChartLifecycle();
	const initialize = vi.fn((): void => {
		lifecycle.deferred(initialize, 100);
	});
	lifecycle.deferred(initialize, 100);
	vi.advanceTimersByTime(100);
	expect(initialize).toHaveBeenCalledTimes(1);
	expect(vi.getTimerCount()).toBe(1);
	lifecycle.dispose();
	vi.runAllTimers();
	expect(vi.getTimerCount()).toBe(0);
	expect(initialize).toHaveBeenCalledTimes(1);
});

test('late deferred work is ignored and late resource registration is released immediately', () => {
	vi.useFakeTimers();
	const lifecycle = createChartLifecycle();
	const initialize = vi.fn();
	const cleanup = vi.fn();
	lifecycle.dispose();
	lifecycle.deferred(initialize, 0);
	const release = lifecycle.add(cleanup);
	release();
	lifecycle.dispose();
	expect(vi.getTimerCount()).toBe(0);
	expect(initialize).not.toHaveBeenCalled();
	expect(cleanup).toHaveBeenCalledTimes(1);
});
