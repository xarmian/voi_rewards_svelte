import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import type { ComponentProps } from 'svelte';
import OHLCVChart from './OHLCVChart.svelte';

const pair = {
	baseTokenId: 0,
	quoteTokenId: 1,
	baseSymbol: 'VOI',
	quoteSymbol: 'USD',
	baseDecimals: 6,
	quoteDecimals: 6
};
const settings = {
	chartType: 'candlestick',
	resolution: '1h',
	showVolume: true,
	autoRefresh: false,
	refreshInterval: 5,
	theme: 'light'
} as const;
const data = [{ time: 1, open: 1, high: 3, low: 0.5, close: 2, volume: 10 }];
function chart(props: Partial<ComponentProps<typeof OHLCVChart>> = {}) {
	return render(OHLCVChart, {
		props: { tokenPair: pair, settings: { ...settings }, data, ...props }
	}).body;
}
function pressed(body: string, label: string) {
	const button = [...body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(
		(b) => b[2].replace(/<!--[\s\S]*?-->/g, '').trim() === label
	);
	expect(button, label).toBeDefined();
	return button?.[1];
}

it('names quote, type and resolution groups and preserves defaults and ordering', () => {
	const body = chart();
	for (const label of ['Quote', 'Chart type', 'Resolution'])
		expect(body).toContain(`role="group" aria-label="${label}"`);
	for (const label of ['USD', 'Candles', '1 hour', 'Volume'])
		expect(pressed(body, label)).toContain('aria-pressed="true"');
	for (const label of ['VOI', 'Line'])
		expect(pressed(body, label)).toContain('aria-pressed="false"');
	const labels = ['1 minute', '5 minutes', '15 minutes', '1 hour', '4 hours', '1 day'];
	for (const label of labels) expect(pressed(body, label)).toBeDefined();
	for (let i = 1; i < labels.length; i++)
		expect(body.indexOf(`>${labels[i - 1]}<`)).toBeLessThan(body.indexOf(`>${labels[i]}<`));
	expect(pressed(body, 'Refresh')).not.toContain('disabled');
});

it('reflects alternative selections and Volume off', () => {
	const body = chart({
		quoteCurrency: 'VOI',
		settings: { ...settings, chartType: 'line', resolution: '1d', showVolume: false }
	});
	for (const label of ['VOI', 'Line', '1 day'])
		expect(pressed(body, label)).toContain('aria-pressed="true"');
	expect(pressed(body, 'Volume')).toContain('aria-pressed="false"');
	expect(pressed(body, 'Volume')).not.toContain('bg-accent-soft');
	expect(pressed(chart(), 'Volume')).toContain('bg-accent-soft');
});

it('keeps loading, empty and ready states distinct', () => {
	expect(chart({ data: [], loading: true })).toContain('Loading chart data...');
	expect(chart({ data: [], loading: true })).not.toContain('No data available');
	expect(chart({ data: [] })).toContain('No data available for this token pair');
	expect(chart()).not.toContain('No data available');
	expect(pressed(chart({ loading: true }), 'Refresh')).toContain('disabled');
});

it('uses a wrapping definition list with neutral high/low and secondary point count', () => {
	const body = chart();
	expect(body).toMatch(/<dl\b[^>]*class="[^"]*flex-wrap/);
	for (const label of ['Open', 'High', 'Low', 'Close', 'Volume'])
		expect(body).toContain(`<dt class="text-ink-muted">${label}:</dt>`);
	expect(body).toMatch(/<dd\b[^>]*text-ink[^>]*>3\.000000/);
	expect(body).toMatch(/text-ink-muted[^>]*>1 data points/);
	expect(body).not.toMatch(/text-(?:gray|green|red)-|dark:|min-height: 400px|transition-all/);
});

it('updates layout and all active series on theme changes without refetching or fitting', () => {
	const source = readFileSync(new URL('./OHLCVChart.svelte', import.meta.url), 'utf8');
	const update = source.match(/function updateChartTheme\(\) \{([\s\S]*?)\n\t\}/)?.[1];
	expect(update).toContain('resolveChartTokens(getComputedStyle(chartContainer))');
	expect(update).toContain('chart.applyOptions(options.chart)');
	expect(update).toContain('mainSeries?.applyOptions(');
	expect(update).toContain('volumeSeries?.applyOptions(options.volume)');
	expect(update).not.toMatch(/fetch|fitContent|scrollTo|updateChartData/);
	// The recolor keeps the user's zoom and pan: capture the range, setData, restore the same range.
	const capture = update!.indexOf('getVisibleLogicalRange()');
	const replace = update!.indexOf('.setData(renderedCandles)');
	const restore = update!.indexOf('setVisibleLogicalRange(range)');
	expect(capture).toBeGreaterThan(-1);
	expect(replace).toBeGreaterThan(capture);
	expect(restore).toBeGreaterThan(replace);
	expect(update!.match(/setVisibleLogicalRange\(/g)).toHaveLength(1);
	expect(source).toContain('onThemeChange(updateChartTheme)');
});

it('connects the named chart, instructions, summary and complete native data disclosure', () => {
	const body = chart({
		data: [
			{ time: 20, open: 2, high: 9, low: 1, close: 3, volume: 1 },
			...data,
			{ time: 20, open: 3, high: 6, low: 2, close: 4, volume: 2 }
		],
		volumes: [{ time: 20, value: 7 }]
	});
	const group = body.match(/<div\b[^>]*role="group"[^>]*tabindex="0"[^>]*>/)?.[0];
	expect(group).toBeDefined();
	for (const attribute of ['aria-labelledby', 'aria-describedby']) {
		const ids = group!.match(new RegExp(attribute + '="([^"]+)"'))?.[1].split(' ');
		expect(ids?.length).toBeGreaterThan(0);
		for (const id of ids!) expect(body).toContain('id="' + id + '"');
	}
	expect(body).toMatch(/<h2\b[^>]*id="[^"]+"/);
	for (const key of ['Left', 'Right', 'Home', 'End', 'Escape']) expect(body).toContain(key);
	expect(body).toMatch(/<details\b[\s\S]*?<summary\b[^>]*>View data<\/summary>/);
	expect(body).toMatch(/<caption\b[^>]*>[\s\S]+?<\/caption>/);
	expect(body).toContain('scope="col"');
	expect(body).toMatch(/role="region"[^>]*aria-label="[^"]+"[^>]*tabindex="0"/);
	expect(body).toMatch(/aria-live="polite"[^>]*>(?:<!--[\s\S]*?-->)*<\/p>/);
	expect(body).not.toMatch(/display\s*:\s*none/);
	const rows = [...body.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)][0]?.[1];
	expect(rows?.match(/<tr>/g)).toHaveLength(2);
	for (const header of ['Open (USD)', 'High (USD)', 'Low (USD)', 'Close (USD)', 'Volume (USD)'])
		expect(body).toContain('>' + header + '</th>');
	expect(rows).toContain('4.000000');
	expect(body).toContain('2 data points');
	expect(body).not.toContain('9.000000');
});
it('wires pointer and keyboard through the shared inspection state and clears on input changes', () => {
	const source = readFileSync(new URL('./OHLCVChart.svelte', import.meta.url), 'utf8');
	expect(source).toContain('onkeydown={handleInspectionKey}');
	expect(source).toContain('inspect(inspection, { key: event.key }, description.observations)');
	expect(source).toContain('inspect(inspection, { pointer: index }, description.observations)');
	expect(source).toContain('inspect(inspection, { reset: true }, description.observations)');
	for (const dependency of ['data', 'volumes', 'tokenPair', 'settings.resolution', 'quoteCurrency'])
		expect(source).toContain('void ' + dependency + ';');
	expect(source).toContain('subscribeCrosshairMove(handleCrosshairMove)');
	expect(source).not.toMatch(/\.focus\(/);
});
