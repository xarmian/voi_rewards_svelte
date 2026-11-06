import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import type { ChainStatus } from '$lib/stores/chainStatus';
import FreshnessBadge from './FreshnessBadge.svelte';

const minute = 60_000;
let state: ChainStatus;
vi.mock('$lib/stores/chainStatus', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/stores/chainStatus')>()),
	chainStatus: { subscribe: (run: (value: ChainStatus) => void) => readable(state).subscribe(run) }
}));

async function announcement(next: ChainStatus) {
	state = next;
	const body = render(FreshnessBadge, { props: { variant: 'bar' } }).body;
	return body.match(/<span class="sr-only" role="status">([^<]*)<\/span>/)?.[1];
}

const base: ChainStatus = {
	round: null,
	lastRoundAt: null,
	lastChangeAt: null,
	error: true,
	checkedAt: 10 * minute,
	startedAt: 0
};

test('a chain that never answered is announced as unavailable, not stale', async () => {
	assert.equal(await announcement(base), 'Block unavailable');
});

test('a chain whose round stopped advancing is announced as stale', async () => {
	assert.equal(
		await announcement({ ...base, round: 5, lastRoundAt: 0, lastChangeAt: 0, error: false }),
		'Chain is stale'
	);
});

test('a chain with a recent round is announced as live', async () => {
	assert.equal(
		await announcement({
			...base,
			round: 5,
			lastRoundAt: 10 * minute,
			lastChangeAt: 10 * minute,
			error: false
		}),
		'Chain is live'
	);
});
