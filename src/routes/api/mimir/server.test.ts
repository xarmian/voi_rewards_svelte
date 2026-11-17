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
const arc72 = `action=get_arc72_transfers&user=${A}&min-round=1&max-round=100&limit=1000&next-token=0`;
it('nests ARC-72 params as the single jsonb argument and never caches them', async () => {
	mocks.abortSignal.mockResolvedValue({ data: { transfers: [] }, error: null });
	const response = await GET(event(arc72));
	expect(response.status).toBe(200);
	expect(mocks.rpc).toHaveBeenLastCalledWith('get_arc72_transfers', {
		params: { user: A, 'min-round': 1, 'max-round': 100, limit: 1000, 'next-token': 0 }
	});
	expect(response.headers.get('Cache-Control')).toBe('no-store');
	expect(await response.json()).toEqual({ data: { transfers: [] } });
});
it('refuses invalid ARC-72 queries uncached without dispatching', async () => {
	for (const query of [
		arc72.replace('next-token=0', 'next-token=1000'),
		arc72.replace('max-round=100', 'max-round=1000002'),
		arc72 + '&tokenId=1'
	]) {
		const response = await GET(event(query));
		expect(response.status).toBe(400);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
	}
	expect(mocks.rpc).not.toHaveBeenCalled();
});
it('keeps ARC-72 upstream errors uncached', async () => {
	mocks.abortSignal.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
	const response = await GET(event(arc72));
	expect(response.status).toBe(500);
	expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it('keeps every existing action dispatched flat and cached as before', async () => {
	const cached = [
		['action=get_online_account_count', 'get_online_account_count', {}],
		['action=get_tx_counts&p_period=day&p_n=7', 'get_tx_counts', { p_period: 'day', p_n: 7 }],
		[
			`action=get_arc200_transfers&p_contractid=7&p_user=${A}&p_limit=100&p_offset=0`,
			'get_arc200_transfers',
			{ p_contractid: 7, p_user: A, p_limit: 100, p_offset: 0 }
		],
		[
			`action=get_block_rewards_daily&p_address=${A}&p_days=7`,
			'get_block_rewards_daily',
			{ p_address: A, p_days: 7 }
		]
	] as const;
	for (const [query, action, params] of cached) {
		const response = await GET(event(query));
		expect(mocks.rpc).toHaveBeenLastCalledWith(action, params);
		expect(response.headers.get('Cache-Control')).toContain('s-maxage=60');
	}
	const response = await GET(event(bounded));
	expect(mocks.rpc).toHaveBeenLastCalledWith('get_arc200_transfers', {
		p_user: A,
		p_limit: 100,
		p_offset: 0,
		p_min_round: 1,
		p_max_round: 100
	});
	expect(response.headers.get('Cache-Control')).toBe('no-store');
});
