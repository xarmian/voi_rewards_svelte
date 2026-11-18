import { test } from 'vitest';
import assert from 'node:assert/strict';
import { retryKeepingFocus } from './retryFocus';

function fakeRegion(calls: string[]) {
	return {
		focus: (options?: FocusOptions) => calls.push(`focus:${JSON.stringify(options)}`)
	} as unknown as HTMLElement;
}

test('no retry callback means no handler, so the alert keeps hiding its button', () => {
	assert.equal(
		retryKeepingFocus(() => null, undefined),
		undefined
	);
});

test('the handler focuses the region without scrolling before it retries', () => {
	const calls: string[] = [];
	const region = fakeRegion(calls);
	const handler = retryKeepingFocus(
		() => region,
		() => calls.push('retry')
	);
	handler?.();
	assert.deepEqual(calls, ['focus:{"preventScroll":true}', 'retry']);
});

test('a missing region still retries', () => {
	let retried = 0;
	retryKeepingFocus(
		() => undefined,
		() => retried++
	)?.();
	assert.equal(retried, 1);
});

test('the region is read when Retry is activated, not when the handler is created', () => {
	const calls: string[] = [];
	const bound: { region?: HTMLElement } = {};
	const handler = retryKeepingFocus(
		() => bound.region,
		() => calls.push('retry')
	);
	bound.region = fakeRegion(calls);
	handler?.();
	assert.deepEqual(calls, ['focus:{"preventScroll":true}', 'retry']);
});
