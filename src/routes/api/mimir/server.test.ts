import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock('$lib/mimir', () => ({ mimirClient: { rpc: mocks.rpc } }));
import { GET } from './+server';
import { UPSTREAM_TIMEOUT_MS } from '$lib/server/fetchWithTimeout';
const A = 'A'.repeat(58);
const bounded = `action=get_arc200_transfers&p_user=${A}&p_limit=100&p_offset=0&p_min_round=1&p_max_round=100`;
function event(query: string, signal = new AbortController().signal) {
	return {
		url: new URL('https://example.test/api/mimir?' + query),
		request: new Request('https://example.test', { signal })
	} as Parameters<typeof GET>[0];
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
	mocks.abortSignal.mockResolvedValue({ data: [], error: null });
});
afterEach(() => vi.useRealTimers());
it('forwards bounded history and nests metadata params with no-store', async () => {
	const response = await GET(event(bounded));
	expect(response.status).toBe(200);
	expect(mocks.rpc).toHaveBeenLastCalledWith('get_arc200_transfers', {
		p_user: A,
		p_limit: 100,
		p_offset: 0,
		p_min_round: 1,
		p_max_round: 100
	});
	expect(response.headers.get('Cache-Control')).toBe('no-store');
	expect(await response.json()).toEqual({ data: [] });
	await GET(event('action=get_arc200_tokens&contractId=1&limit=1&next-token=0'));
	expect(mocks.rpc).toHaveBeenLastCalledWith('get_arc200_tokens', {
		params: { contractId: '1', limit: 1, 'next-token': 0 }
	});
});
it('keeps legacy caching and never dispatches invalid queries', async () => {
	expect(
		(await GET(event('action=get_online_account_count'))).headers.get('Cache-Control')
	).toContain('s-maxage=60');
	mocks.rpc.mockClear();
	const response = await GET(event(bounded.replace('&p_min_round=1', '')));
	expect(response.status).toBe(400);
	expect(response.headers.get('Cache-Control')).toBe('no-store');
	expect(mocks.rpc).not.toHaveBeenCalled();
});
it('keeps upstream errors as uncached errors', async () => {
	mocks.abortSignal.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
	const response = await GET(event(bounded));
	expect(response.status).toBe(500);
	expect(response.headers.get('Cache-Control')).toBe('no-store');
	expect(await response.json()).toEqual({ error: 'unavailable' });
});
it('forwards both caller abort and the existing upstream timeout', async () => {
	const controller = new AbortController();
	await GET(event('action=get_online_account_count', controller.signal));
	const signal = mocks.abortSignal.mock.calls[0][0] as AbortSignal;
	controller.abort();
	expect(signal.aborted).toBe(true);
	const timeout = vi.spyOn(AbortSignal, 'timeout');
	await GET(event('action=get_online_account_count'));
	expect(timeout).toHaveBeenCalledWith(UPSTREAM_TIMEOUT_MS);
	timeout.mockRestore();
});
