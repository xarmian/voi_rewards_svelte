import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/supabase', () => ({ supabasePrivateClient: { rpc } }));

import { GET } from './+server';

const call = (query = '') =>
	GET({ url: new URL(`https://example.com/api/price-history${query}`) } as never);

describe('/api/price-history', () => {
	beforeEach(() => rpc.mockReset());

	it('drops buckets with no volume-weighted price (snapshots with null volume only)', async () => {
		rpc.mockResolvedValue({
			data: [
				{ bucket_time: '100', value: 0.002 },
				{ bucket_time: '200', value: null },
				{ bucket_time: '300', value: 0.003 }
			],
			error: null
		});
		const response = await call('?period=24h&trading_pair_id=22');
		expect(rpc).toHaveBeenCalledWith('get_price_history', {
			p_period: '24h',
			p_trading_pair_id: '22'
		});
		expect(await response.json()).toEqual([
			{ time: '100', value: 0.002 },
			{ time: '300', value: 0.003 }
		]);
	});

	it('keeps every bucket that has a value', async () => {
		rpc.mockResolvedValue({ data: [{ bucket_time: '100', value: 0.002 }], error: null });
		expect(await (await call()).json()).toEqual([{ time: '100', value: 0.002 }]);
	});
});
