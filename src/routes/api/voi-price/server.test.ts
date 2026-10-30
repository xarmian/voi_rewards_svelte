import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/supabase', () => ({ supabasePrivateClient: { rpc } }));

// The handler caches the price at module level, so each test loads a fresh module.
async function load() {
	vi.resetModules();
	return (await import('./+server')).GET;
}

describe('/api/voi-price', () => {
	beforeEach(() => rpc.mockReset());

	it('uses the newest bucket that has a price when the last one is null', async () => {
		rpc.mockResolvedValue({
			data: [
				{ bucket_time: '100', value: 0.002 },
				{ bucket_time: '200', value: 0.003 },
				{ bucket_time: '300', value: null }
			],
			error: null
		});
		const GET = await load();
		const body = await (await GET({} as never)).json();
		expect(body.price).toBe(0.003);
	});

	it('uses the last bucket when it has a price', async () => {
		rpc.mockResolvedValue({
			data: [
				{ bucket_time: '100', value: 0.002 },
				{ bucket_time: '200', value: 0.004 }
			],
			error: null
		});
		const GET = await load();
		expect((await (await GET({} as never)).json()).price).toBe(0.004);
	});
});
