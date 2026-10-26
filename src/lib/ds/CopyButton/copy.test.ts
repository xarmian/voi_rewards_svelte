import { afterEach, describe, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { tick } from 'svelte';
import { createCopyHandler, type CopyFeedback } from './copy';

vi.mock('svelte', () => ({ tick: vi.fn(() => Promise.resolve()) }));

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.mocked(tick).mockReset().mockResolvedValue();
});

function deferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

function setup(writeText: (text: string) => Promise<void>) {
	vi.useFakeTimers();
	vi.stubGlobal('navigator', { clipboard: { writeText } });
	const feedback: CopyFeedback = { status: 'idle', announcement: '' };
	return { feedback, ...createCopyHandler(feedback) };
}

describe('CopyButton', () => {
	test('calls clipboard before any tick and clears live text after the clipboard call', async () => {
		const order: string[] = [];
		const { feedback, copy } = setup(async (text) => {
			order.push(`write:${text}`);
			assert.equal(feedback.announcement, 'Copied address');
		});
		feedback.announcement = 'Copied address';
		vi.mocked(tick).mockImplementation(async () => {
			order.push('tick');
			assert.equal(feedback.announcement, '');
		});
		const pending = copy('address', 'address');
		assert.equal(order[0], 'write:address', 'clipboard is called in the click handler first turn');
		await pending;
		assert.deepEqual(order, ['write:address', 'tick']);
		assert.deepEqual(feedback, { status: 'copied', announcement: 'Copied address' });
	});

	for (const outcome of ['resolve', 'reject'] as const) {
		test(`overlapping calls keep the latest feedback until its own timeout when the first ${outcome}s late`, async () => {
			const first = deferred();
			const second = deferred();
			const writeText = vi
				.fn()
				.mockReturnValueOnce(first.promise)
				.mockReturnValueOnce(second.promise);
			const { feedback, copy } = setup(writeText);
			const oldCall = copy('first', 'first address');
			const latestCall = copy('second', 'second address');
			second.resolve();
			await latestCall;
			assert.deepEqual(feedback, { status: 'copied', announcement: 'Copied second address' });
			await vi.advanceTimersByTimeAsync(500);
			if (outcome === 'resolve') first.resolve();
			else first.reject(new Error('Permission denied'));
			await oldCall;
			assert.deepEqual(feedback, { status: 'copied', announcement: 'Copied second address' });
			assert.equal(vi.getTimerCount(), 1);
			await vi.advanceTimersByTimeAsync(999);
			assert.deepEqual(feedback, { status: 'copied', announcement: 'Copied second address' });
			await vi.advanceTimersByTimeAsync(1);
			assert.deepEqual(feedback, { status: 'idle', announcement: '' });
		});
	}

	test('a previous reset timer cannot clear a newer call and repeated success is re-announced', async () => {
		const { feedback, copy } = setup(async () => {});
		await copy('address', 'address');
		await vi.advanceTimersByTimeAsync(1000);
		vi.mocked(tick).mockImplementation(async () => {
			assert.equal(feedback.announcement, '');
		});
		await copy('address', 'address');
		assert.equal(vi.getTimerCount(), 1);
		await vi.advanceTimersByTimeAsync(500);
		assert.deepEqual(feedback, { status: 'copied', announcement: 'Copied address' });
		await vi.advanceTimersByTimeAsync(1000);
		assert.deepEqual(feedback, { status: 'idle', announcement: '' });
	});
});
