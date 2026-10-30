import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import TokenMetricsBar from './TokenMetricsBar.svelte';
import type { UniqueToken } from '../../routes/api/tokens/+server';

it.each([
	[null, '—'],
	[1234.56, '$1,234.56'],
	[0, '-']
] as const)('selected pool snapshot volume %s renders %s', (volume, expected) => {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => new Promise<Response>(() => {}))
	);
	vi.spyOn(console, 'log').mockImplementation(() => {});
	try {
		const { body } = render(TokenMetricsBar, {
			props: {
				selectedToken: { id: 0, symbol: 'VOI' } as UniqueToken,
				selectedPool: {
					baseTokenId: 0,
					quoteTokenId: 1,
					baseSymbol: 'VOI',
					quoteSymbol: 'USDC',
					baseDecimals: 6,
					quoteDecimals: 6,
					poolId: 22
				},
				marketData: [{ trading_pair_id: 22, volume_24h: volume }],
				quoteSymbol: 'USD'
			}
		});
		const cell = body.match(/24h Volume\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/)?.[1];
		expect(cell?.replace(/<!--[\s\S]*?-->/g, '').trim()).toBe(expected);
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});
