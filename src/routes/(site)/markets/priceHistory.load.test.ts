import { expect, it, vi } from 'vitest';
import { load } from './+page';

it('the markets load gives an empty price history when /api/price-history answers 500', async () => {
	const fetcher = vi.fn(async (path: string) => {
		if (path.startsWith('/api/price-history'))
			return new Response(JSON.stringify({ error: 'x' }), { status: 500 });
		if (path.startsWith('/api/markets'))
			return Response.json({ marketData: [{ trading_pair_id: 1 }] });
		return Response.json({});
	});
	const data = await load({
		fetch: fetcher,
		url: new URL('https://example.test/markets')
	} as never);
	expect(data).toMatchObject({ priceHistory: [], marketData: [{ trading_pair_id: 1 }] });
});
