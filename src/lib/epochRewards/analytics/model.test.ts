import { expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import epochs from '$lib/network/fixtures/epochs.json';
import { createEpochAnalytics } from './model';

const now = Date.parse('2026-11-06T12:00:00Z');
function setup() {
	const fetcher = vi.fn<typeof fetch>(async () => Response.json(epochs));
	return { model: createEpochAnalytics({ fetch: fetcher, now: () => now }), fetcher };
}

it('reads the epoch stats once and publishes the series', async () => {
	const { model, fetcher } = setup();
	expect(get(model)).toMatchObject({ epochs: null, busy: true, range: '26', announcement: '' });
	await model.load();
	expect(fetcher).toHaveBeenCalledTimes(1);
	expect(fetcher.mock.calls[0][0]).toBe('/api/epochs');
	expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
	const state = get(model);
	expect(state.busy).toBe(false);
	expect(state.epochs?.status).toBe('ready');
	expect(state.epochs?.current?.epoch).toBe(106);
	expect(state.epochs?.receivedAt).toBe(now);
});

it('changes the range locally and announces a changed selection once', async () => {
	const { model, fetcher } = setup();
	await model.load();
	model.setRange('12');
	model.setRange('12');
	expect(get(model)).toMatchObject({ range: '12', announcement: 'APR range: last 12 epochs.' });
	model.setRange('all');
	expect(get(model).announcement).toBe('APR range: all available epochs.');
	expect(fetcher).toHaveBeenCalledTimes(1);
});

it('keeps the last rows as stale when a retry fails', async () => {
	const { model, fetcher } = setup();
	await model.load();
	const original = get(model).epochs;
	fetcher.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
	await model.retry();
	expect(get(model).epochs).toEqual({ ...original, status: 'stale' });
	fetcher.mockRejectedValueOnce(new Error('offline'));
	await model.retry();
	expect(get(model).epochs?.status).toBe('stale');
	expect(get(model).busy).toBe(false);
});

it('publishes only the latest of overlapping reads', async () => {
	const { model, fetcher } = setup();
	let release: (response: Response) => void = () => {};
	fetcher.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
	const first = model.load();
	const second = model.retry();
	await second;
	release(new Response('Unavailable', { status: 503 }));
	await first;
	expect(get(model).epochs?.status).toBe('ready');
	expect(get(model).busy).toBe(false);
});
