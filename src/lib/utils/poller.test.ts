import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPoller } from './poller';

class Visibility extends EventTarget {
	visibilityState: DocumentVisibilityState = 'visible';
	set(state: DocumentVisibilityState) {
		this.visibilityState = state;
		this.dispatchEvent(new Event('visibilitychange'));
	}
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('TASK-30 schedules only after settlement and shares manual and timer runs', async () => {
	const visibility = new Visibility();
	let resolve!: () => void;
	const task = vi.fn(() => new Promise<void>((done) => (resolve = done)));
	const poller = createPoller({ task, visibility });
	poller.start(1000);
	const manual = poller.run();
	await vi.advanceTimersByTimeAsync(5000);
	expect(task).toHaveBeenCalledTimes(1);
	resolve();
	await manual;
	await vi.advanceTimersByTimeAsync(999);
	expect(task).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	expect(task).toHaveBeenCalledTimes(2);
	poller.destroy();
	resolve();
	await vi.advanceTimersByTimeAsync(5000);
	expect(task).toHaveBeenCalledTimes(2);
	expect(vi.getTimerCount()).toBe(0);
});

it('pauses hidden polling and runs immediately on becoming visible', async () => {
	const visibility = new Visibility();
	const task = vi.fn(async () => {});
	const remove = vi.spyOn(visibility, 'removeEventListener');
	const poller = createPoller({ task, visibility });
	poller.start(1000);
	await vi.advanceTimersByTimeAsync(0);
	visibility.set('hidden');
	await vi.advanceTimersByTimeAsync(5000);
	expect(task).toHaveBeenCalledTimes(1);
	expect(vi.getTimerCount()).toBe(0);
	visibility.set('visible');
	await vi.advanceTimersByTimeAsync(0);
	expect(task).toHaveBeenCalledTimes(2);
	await vi.advanceTimersByTimeAsync(1000);
	expect(task).toHaveBeenCalledTimes(3);
	poller.stop();
	visibility.set('hidden');
	visibility.set('visible');
	await vi.advanceTimersByTimeAsync(5000);
	expect(task).toHaveBeenCalledTimes(3);
	poller.destroy();
	expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
	expect(vi.getTimerCount()).toBe(0);
});

it('does not start in a hidden tab and cannot restart after destroy', async () => {
	const visibility = new Visibility();
	visibility.set('hidden');
	const task = vi.fn(async () => {});
	const poller = createPoller({ task, visibility });
	poller.start(1000);
	await poller.run();
	expect(task).not.toHaveBeenCalled();
	visibility.set('visible');
	await vi.advanceTimersByTimeAsync(0);
	expect(task).toHaveBeenCalledTimes(1);
	poller.destroy();
	poller.start(1000);
	await poller.run();
	visibility.set('hidden');
	visibility.set('visible');
	await vi.advanceTimersByTimeAsync(5000);
	expect(task).toHaveBeenCalledTimes(1);
});

it('resumes without overlap when visibility changes during a request', async () => {
	const visibility = new Visibility();
	let resolve!: () => void;
	const task = vi.fn(() => new Promise<void>((done) => (resolve = done)));
	const poller = createPoller({ task, visibility });
	poller.start(1000);
	await Promise.resolve();
	visibility.set('hidden');
	visibility.set('visible');
	await vi.advanceTimersByTimeAsync(5000);
	expect(task).toHaveBeenCalledTimes(1);
	resolve();
	await vi.advanceTimersByTimeAsync(1000);
	expect(task).toHaveBeenCalledTimes(2);
	poller.stop();
	resolve();
	await vi.advanceTimersByTimeAsync(5000);
	expect(task).toHaveBeenCalledTimes(2);
	poller.destroy();
});

it('schedules after a rejected task and permits a one-off run while stopped', async () => {
	const visibility = new Visibility();
	const task = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
	const poller = createPoller({ task, visibility });
	poller.start(1000);
	await vi.advanceTimersByTimeAsync(1000);
	expect(task).toHaveBeenCalledTimes(2);
	poller.stop();
	await poller.run();
	await vi.advanceTimersByTimeAsync(5000);
	expect(task).toHaveBeenCalledTimes(3);
	poller.destroy();
});
