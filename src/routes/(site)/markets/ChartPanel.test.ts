import { expect, it, vi } from 'vitest';
import { createRawSnippet, type ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import ChartPanel from './ChartPanel.svelte';

function panel(props: Partial<ComponentProps<typeof ChartPanel>> = {}) {
	return render(ChartPanel, { props: {
		showTokenChart: false,
		selectedToken: { id: 0, symbol: 'VOI', decimals: 6 } as ComponentProps<typeof ChartPanel>['selectedToken'],
		tokenChartLoading: false, tokenChartError: '', tokenChartData: [], tokenChartVolumes: [],
		currentQuoteCurrency: 'USD',
		chartSettings: { chartType: 'candlestick', resolution: '1h', showVolume: true, autoRefresh: false, refreshInterval: 5, theme: 'light' },
		handleChartResolutionChange: vi.fn(), handleChartTypeChange: vi.fn(), fetchVOIChartData: vi.fn(), fetchTokenChartData: vi.fn(),
		children: createRawSnippet(() => ({ render: () => '<p>Price fixture</p>' })), ...props
	} }).body;
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
	const body = panel({ showTokenChart: true, tokenChartData: [{ time: 1, open: 1, high: 2, low: 0, close: 2, volume: 1 }] });
	expect(body).toContain('aria-label="Resolution"');
	expect((body.match(/shadow-card/g) ?? []).length).toBe(1);
	expect(body).not.toMatch(/height: 640px|overflow-hidden|Fallback price chart/);
});
