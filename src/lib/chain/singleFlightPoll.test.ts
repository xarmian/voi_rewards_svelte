import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollUntil, type PollReport } from './singleFlightPoll';

const defaults = { intervalMs: 100, checkTimeoutMs: 1000, deadlineMs: 5000 };
const checking = async () => ({ done: false as const });

describe('pollUntil', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		expect(vi.getTimerCount()).toBe(0);
		vi.useRealTimers();
	});

	it('runs at most one check and waits a full interval after a slow check settles', async () => {
		let active = 0;
		let maxActive = 0;
		const starts: number[] = [];
		const start = Date.now();
		const check = vi.fn(async () => {
			starts.push(Date.now() - start);
			maxActive = Math.max(maxActive, ++active);
			await new Promise((resolve) => setTimeout(resolve, 300));
			active--;
			return starts.length === 2 ? { done: true as const, value: 'ok' } : { done: false as const };
		});
		const result = pollUntil({ ...defaults, check });
		await vi.advanceTimersByTimeAsync(399);
		expect(check).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(301);
		expect(await result).toEqual({ status: 'done', value: 'ok' });
		expect(starts).toEqual([0, 400]);
		expect(maxActive).toBe(1);
	});

	it('aborts a hung check at its timeout and counts exactly one error', async () => {
		let received: AbortSignal | undefined;
		const check = vi.fn((signal: AbortSignal) => {
			received = signal;
			return new Promise<{ done: false }>((_, reject) => {
				signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
			});
		});
		const onReport = vi.fn();
		const controller = new AbortController();
		const result = pollUntil({
			...defaults,
			check,
			checkTimeoutMs: 2000,
			signal: controller.signal,
			onReport,
			unavailableAfter: 1
		});
		await vi.advanceTimersByTimeAsync(1999);
		expect(received?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(received?.aborted).toBe(true);
		expect(onReport.mock.calls).toEqual([
			[{ status: 'unavailable', consecutiveErrors: 1, error: 'timed out after 2s' }]
		]);
		controller.abort();
		expect(await result).toEqual({ status: 'aborted' });
	});

	it('never starts another check while a timed-out check still has not settled', async () => {
		const check = vi.fn(() => new Promise<{ done: false }>(() => {}));
		const onReport = vi.fn();
		const result = pollUntil({
			...defaults,
			check,
			onReport,
			checkTimeoutMs: 100,
			deadlineMs: 500,
			unavailableAfter: 1
		});
		await vi.advanceTimersByTimeAsync(500);
		expect(await result).toEqual({ status: 'timeout' });
		expect(check).toHaveBeenCalledTimes(1);
		expect(onReport).toHaveBeenCalledTimes(1);
	});

	it('reports unavailable after consecutive errors and checking again on success', async () => {
		let calls = 0;
		const reports: PollReport[] = [];
		const signals: AbortSignal[] = [];
		const check = (signal: AbortSignal) => {
			signals.push(signal);
			calls++;
			if (calls === 1) throw new Error('offline');
			if (calls === 2) return Promise.reject(new Error('still offline'));
			if (calls === 3) return Promise.resolve({ done: false as const });
			return Promise.resolve({ done: true as const, value: 42 });
		};
		const result = pollUntil({ ...defaults, check, onReport: (report) => reports.push(report) });
		await vi.advanceTimersByTimeAsync(300);
		expect(await result).toEqual({ status: 'done', value: 42 });
		expect(reports).toEqual([
			{ status: 'checking' },
			{ status: 'unavailable', consecutiveErrors: 2, error: 'still offline' },
			{ status: 'checking' },
			{ status: 'checking' }
		]);
		expect(new Set(signals).size).toBe(4);
	});

	it('returns done even if onReport throws', async () => {
		expect(
			await pollUntil({
				...defaults,
				check: async () => ({ done: true, value: 'value' }),
				onReport: () => {
					throw new Error('view gone');
				}
			})
		).toEqual({ status: 'done', value: 'value' });
	});

	it('times out exactly at the deadline without sleeping past it or starting another check', async () => {
		const sleep = vi.fn((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
		const check = vi.fn(checking);
		const start = Date.now();
		const result = pollUntil({ ...defaults, check, sleep, now: () => Date.now(), deadlineMs: 250 });
		await vi.advanceTimersByTimeAsync(250);
		expect(await result).toEqual({ status: 'timeout' });
		expect(Date.now() - start).toBe(250);
		expect(check).toHaveBeenCalledTimes(3);
		expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 100, 50]);
	});

	it('checks the injected clock after a check before sleeping', async () => {
		let time = 0;
		const sleep = vi.fn();
		const check = vi.fn(async () => {
			time = 5000;
			return { done: false as const };
		});
		expect(await pollUntil({ ...defaults, check, now: () => time, sleep })).toEqual({
			status: 'timeout'
		});
		expect(sleep).not.toHaveBeenCalled();
	});

	it('aborts promptly during an uncooperative check', async () => {
		let received: AbortSignal | undefined;
		const controller = new AbortController();
		const check = vi.fn((signal: AbortSignal) => {
			received = signal;
			return new Promise<{ done: false }>(() => {});
		});
		const result = pollUntil({ ...defaults, check, signal: controller.signal });
		await vi.advanceTimersByTimeAsync(0);
		controller.abort();
		expect(await result).toEqual({ status: 'aborted' });
		expect(received?.aborted).toBe(true);
	});

	it('aborts promptly during sleep', async () => {
		const controller = new AbortController();
		const check = vi.fn(checking);
		const result = pollUntil({ ...defaults, check, signal: controller.signal });
		await vi.advanceTimersByTimeAsync(0);
		controller.abort();
		expect(await result).toEqual({ status: 'aborted' });
		expect(check).toHaveBeenCalledTimes(1);
	});

	it('does not start a check with an already aborted signal', async () => {
		const controller = new AbortController();
		controller.abort();
		const check = vi.fn(checking);
		expect(await pollUntil({ ...defaults, check, signal: controller.signal })).toEqual({
			status: 'aborted'
		});
		expect(check).not.toHaveBeenCalled();
	});
});
