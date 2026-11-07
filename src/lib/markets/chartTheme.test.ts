import { describe, expect, it } from 'vitest';
import {
	chartThemeOptions,
	resolveChartTokens,
	themedCandles,
	themedVolumes
} from './chartTheme';

const palettes = {
	light: ['255 255 255', '27 20 51', '102 93 134', '139 128 173', '238 233 251', '124 58 237', '4 120 87', '190 18 60', '180 83 9', '109 40 217'],
	dark: ['25 19 48', '241 237 255', '165 156 200', '122 111 163', '37 29 64', '167 139 250', '74 222 128', '251 113 133', '251 191 36', '196 181 253']
};
const names = ['surface', 'ink', 'ink-muted', 'edge', 'grid', 'accent-fill', 'ok', 'danger', 'series-3', 'focus'];
function tokens(mode: keyof typeof palettes) {
	const properties = Object.fromEntries(names.map((name, i) => [`--c-${name}`, palettes[mode][i]]));
	return resolveChartTokens({
		getPropertyValue: (name: string) => properties[name] ?? '',
		fontFamily: 'Lato, sans-serif'
	});
}
const rgb = (channels: string) => `rgb(${channels.split(' ').join(', ')})`;

describe.each(['light', 'dark'] as const)('%s chart palette', (mode) => {
	it('resolves RGB triples and supplies layout, text, axes, grid, crosshair and every series', () => {
		const t = tokens(mode);
		const o = chartThemeOptions(t);
		const p = palettes[mode].map(rgb);
		expect(o.chart.layout).toEqual({ background: { type: 'solid', color: p[0] }, textColor: p[1], fontFamily: 'Lato, sans-serif', fontSize: 13 });
		expect(o.chart.rightPriceScale).toEqual({ borderColor: p[3], textColor: p[2] });
		expect(o.chart.timeScale).toEqual({ borderColor: p[3] });
		expect(o.chart.grid).toEqual({ vertLines: { color: p[4] }, horzLines: { color: p[4] } });
		for (const axis of ['vertLine', 'horzLine'] as const) {
			expect(o.chart.crosshair?.[axis]).toEqual({ color: p[2], labelBackgroundColor: p[0] });
		}
		expect(o.line.color).toBe(p[5]);
		expect(o.line.priceLineColor).toBe(p[5]);
		expect(o.candles).toMatchObject({ upColor: p[6], downColor: p[7], wickUpColor: p[6], wickDownColor: p[7], borderUpColor: p[6], borderDownColor: p[7], priceLineColor: p[5] });
		expect(o.volume.color).toBe(p[8]);
		expect(t.focus).toBe(p[9]);
	});

	it('maps known up, down and unchanged OHLC observations without mutating them', () => {
		const input = [
			{ time: 1, open: 2, high: 4, low: 1, close: 3 },
			{ time: 2, open: 3, high: 4, low: 1, close: 2 },
			{ time: 3, open: 2, high: 4, low: 1, close: 2 }
		];
		const original = structuredClone(input);
		const output = themedCandles(input, tokens(mode));
		expect(output.map((p) => p.color)).toEqual([tokens(mode).ok, tokens(mode).danger, tokens(mode)['ink-muted']]);
		expect(input).toEqual(original);
		expect(output.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))).toEqual(input);
	});

	it('discards upstream volume colors only in renderer copies', () => {
		const input = [{ time: 1, value: 10, color: '#e5e7eb' }, { time: 2, value: 0 }];
		expect(themedVolumes(input)).toEqual([{ time: 1, value: 10 }, { time: 2, value: 0 }]);
		expect(input[0].color).toBe('#e5e7eb');
	});
});

it('returns a complete new theme set without data, range or selection options', () => {
	const light = chartThemeOptions(tokens('light'));
	const dark = chartThemeOptions(tokens('dark'));
	for (const key of ['chart', 'line', 'candles', 'volume'] as const) {
		expect(dark[key]).not.toEqual(light[key]);
	}
	expect(Object.keys(dark).sort()).toEqual(['candles', 'chart', 'line', 'volume']);
	expect(JSON.stringify(dark)).not.toMatch(/data|visibleRange|resolution|selected|fitContent/);
});

it('keeps reduced-motion and ordinary rendering free of animation', () => {
	const o = chartThemeOptions(tokens('light'));
	expect(o.chart.kineticScroll).toEqual({ mouse: false, touch: false });
	expect(o.line.lastPriceAnimation).toBe(0);
});

it('uses defined token and font fallbacks when a custom property cannot resolve', () => {
	const t = resolveChartTokens({ getPropertyValue: () => '', fontFamily: '' });
	for (const name of names) expect(t[name as keyof typeof t]).toMatch(/^rgb\(/);
	expect(t.fontFamily).toContain('Lato');
	expect(chartThemeOptions(t).volume.color).toBeDefined();
});
