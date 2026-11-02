import { expect, test, vi } from 'vitest';
import { runBounded } from './boundedPool';

test('runs every item exactly once with at most the requested tasks in flight', async () => {
	const items = [0, 1, 2, 3, 4, 5, 6];
	const gates = items.map(() => Promise.withResolvers<void>());
	const seen: number[] = [];
	let inFlight = 0;
	let maxInFlight = 0;
	const running = runBounded(items, 4, async (item) => {
		seen.push(item);
		inFlight++;
		maxInFlight = Math.max(maxInFlight, inFlight);
		await gates[item].promise;
		inFlight--;
	});

	expect(seen).toEqual([0, 1, 2, 3]);
	gates[1].resolve();
	await vi.waitFor(() => expect(seen).toEqual([0, 1, 2, 3, 4]));
	expect(inFlight).toBe(4);
	for (const gate of gates) gate.resolve();
	await expect(running).resolves.toBeUndefined();
	expect(maxInFlight).toBe(4);
	expect(inFlight).toBe(0);
	expect(seen.toSorted()).toEqual(items);
});

test('a rejecting task does not reject the pool or prevent remaining items from running', async () => {
	const seen: number[] = [];
	await expect(
		runBounded([0, 1, 2, 3], 1, async (item) => {
			seen.push(item);
			if (item === 1) throw new Error('lookup failed');
		})
	).resolves.toBeUndefined();
	expect(seen).toEqual([0, 1, 2, 3]);
});

test('an empty list resolves without calling the task', async () => {
	const task = vi.fn();
	await expect(runBounded([], 4, task)).resolves.toBeUndefined();
	expect(task).not.toHaveBeenCalled();
});

test.each([0, -2])('treats limit %s as one worker', async (limit) => {
	const first = Promise.withResolvers<void>();
	const seen: number[] = [];
	const running = runBounded([0, 1, 2], limit, async (item) => {
		seen.push(item);
		if (item === 0) await first.promise;
	});
	expect(seen).toEqual([0]);
	first.resolve();
	await expect(running).resolves.toBeUndefined();
	expect(seen).toEqual([0, 1, 2]);
});
