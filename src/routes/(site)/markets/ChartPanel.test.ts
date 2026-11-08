import { expect, it, vi } from 'vitest';
import { createRawSnippet, type ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import ChartPanel from './ChartPanel.svelte';

function panel(props: Partial<ComponentProps<typeof ChartPanel>> = {}) {
	return render(ChartPanel, {
		props: {
			showTokenChart: false,
			selectedToken: { id: 0, symbol: 'VOI', decimals: 6 } as ComponentProps<
				typeof ChartPanel
			>['selectedToken'],
			tokenChartLoading: false,
			tokenChartError: '',
			tokenChartData: [],
			tokenChartVolumes: [],
			currentQuoteCurrency: 'USD',
			chartSettings: {
				chartType: 'candlestick',
				resolution: '1h',
				showVolume: true,
				autoRefresh: false,
				refreshInterval: 5,
				theme: 'light'
			},
			handleChartResolutionChange: vi.fn(),
			handleChartTypeChange: vi.fn(),
			fetchVOIChartData: vi.fn(),
			fetchTokenChartData: vi.fn(),
			children: createRawSnippet(() => ({ render: () => '<p>Price fixture</p>' })),
			...props
		}
	}).body;
}

it('keeps the fetch-failure alert visible with the labelled fallback when showTokenChart is false', () => {
	const body = panel({ tokenChartError: 'OHLCV request failed' });
	expect(body).toMatch(/role="alert"[^>]*>[\s\S]*?OHLCV request failed/);
	expect(body).toContain('Fallback price chart');
	expect(body).toContain('Price fixture');
	expect(body).not.toContain('Loading chart');
});
it('labels the ordinary fallback without inventing a fetch error', () => {
	const body = panel();
	expect(body).toContain('Fallback price chart');
	expect(body).not.toContain('role="alert"');
});
it('keeps loading, error, empty and ready OHLCV states distinct inside one card', () => {
	expect(panel({ showTokenChart: true, tokenChartLoading: true })).toContain('Loading chart...');
	expect(panel({ showTokenChart: true, tokenChartError: 'Failed' })).toContain('Failed');
	expect(panel({ showTokenChart: true })).toContain('No chart data available.');
	const body = panel({
		showTokenChart: true,
		tokenChartData: [{ time: 1, open: 1, high: 2, low: 0, close: 2, volume: 1 }]
	});
	expect(body).toContain('aria-label="Resolution"');
	expect(
		(body.match(/class="[^"]*rounded-card border border-line bg-surface text-ink/g) ?? []).length
	).toBe(1);
	expect(body).not.toMatch(/height: 640px|overflow-hidden|Fallback price chart/);
});
it('shows a first OHLCV load as loading, not as the fallback chart', () => {
	const body = panel({ showTokenChart: false, tokenChartLoading: true });
	expect(body).toContain('Loading chart...');
	expect(body).not.toContain('Fallback price chart');
	expect(body).not.toContain('Price fixture');
});
it('shows the labelled fallback when nothing is loading and no OHLCV chart is showing', () => {
	const body = panel({ showTokenChart: false, tokenChartLoading: false });
	expect(body).toContain('Fallback price chart');
	expect(body).toContain('Price fixture');
});

it('names the existing chart Card region in every state', () => {
	for (const props of [
		{},
		{ showTokenChart: true },
		{ showTokenChart: true, tokenChartLoading: true },
		{ tokenChartError: 'Failed' }
	]) {
		const body = panel(props);
		const section = body.match(/<section\b[^>]*aria-labelledby="([^"]+)"/);
		expect(section).toBeTruthy();
		expect(body).toContain('id="' + section![1] + '"');
		expect(body).toMatch(/<h2\b[^>]*>Market chart(?:<!--[\s\S]*?-->)*<\/h2>/);
	}
});

it('names the selected pair and offers Back only for a pair selection', () => {
	const body = panel({
		selectedMarket: {
			trading_pair_id: 22,
			pair: 'ABC/USDC',
			exchange: 'Example',
			base_token_id: 1,
			quote_token_id: 2
		}
	});
	expect(body).toMatch(/<h2\b[^>]*>[^<]*ABC\/USDC/);
	expect(body).toContain('Back to VOI');
	expect(panel()).not.toContain('Back to');
});
it.each(['Failed to load market OHLCV (503)', 'No chart data available.'])(
	'keeps the selected pair message and Back in the card: %s',
	(message) => {
		const body = panel({
			showTokenChart: true,
			selectedMarket: {
				trading_pair_id: 22,
				pair: 'ABC/USDC',
				exchange: 'Example',
				base_token_id: 1,
				quote_token_id: 2
			},
			tokenChartError: message
		});
		expect(body).toMatch(/role="alert"[^>]*>[\s\S]*?ABC|role="alert"/);
		expect(body).toContain(message);
		expect(body).toContain('Back to VOI');
		expect(body).not.toContain('Price fixture');
	}
);
it('names the quote a non-VOI token chart shows, so the heading and the plotted series agree', () => {
	const token = { id: 7, symbol: 'ABC', decimals: 6 } as ComponentProps<
		typeof ChartPanel
	>['selectedToken'];
	const data = [{ time: 1, open: 1, high: 2, low: 0, close: 2, volume: 1 }];
	const heading = (body: string) => body.replace(/<!--[\s\S]*?-->/g, '');
	const usd = heading(panel({ showTokenChart: true, selectedToken: token, tokenChartData: data }));
	expect(usd).toMatch(/ABC\/USD\b/);
	expect(usd).not.toContain('ABC/VOI');
	const voi = heading(
		panel({
			showTokenChart: true,
			selectedToken: token,
			tokenChartData: data,
			currentQuoteCurrency: 'VOI'
		})
	);
	expect(voi).toMatch(/ABC\/VOI\b/);
	expect(voi).not.toContain('ABC/USD');
});
it('retains the OHLCV chart during a refetch and after a refetch error', () => {
	for (const state of [{ tokenChartLoading: true }, { tokenChartError: 'Offline' }]) {
		const body = panel({
			showTokenChart: true,
			tokenChartData: [{ time: 1, open: 1, high: 2, low: 0, close: 2, volume: 1 }],
			...state
		});
		expect(body).toContain('aria-label="Resolution"');
		if ('tokenChartLoading' in state) expect(body).toContain('Loading chart data...');
		else expect(body).toContain('Offline');
	}
});

it.each([
	['USD', 'Prices in USD'],
	[null, 'Prices in VOI']
])('names the quote of a selected VOI pair (%s) in the chart text', (selectedQuote, expected) => {
	const body = panel({
		showTokenChart: true,
		tokenChartData: [{ time: 1, open: 1, high: 2, low: 0, close: 2, volume: 1 }],
		selectedMarket: {
			trading_pair_id: 22,
			pair: 'ABC/VOI',
			exchange: 'Example',
			base_token_id: 1,
			quote_token_id: 390001
		},
		selectedQuote
	});
	expect(body).toContain(expected);
});
