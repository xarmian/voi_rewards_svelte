import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import PriceChart from './PriceChart.svelte';

it.each(['24h', '7d'] as const)(
	'names the period group and exposes selected %s',
	(selectedPeriod) => {
		const body = render(PriceChart, {
			props: { data: [], selectedPeriod, onPeriodChange: vi.fn() }
		}).body;
		expect(body).toMatch(/role="group" aria-label="Period"/);
		const buttons = [...body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
		for (const [value, label] of [
			['24h', '24H'],
			['7d', '7D']
		]) {
			const button = buttons.find((b) => b[2].includes(label));
			expect(button?.[1]).toContain(`aria-pressed="${selectedPeriod === value}"`);
		}
	}
);

it('updates the mounted price series and layout without refetching or changing the range', () => {
	const source = readFileSync(new URL('./PriceChart.svelte', import.meta.url), 'utf8');
	const update = source.match(/function updateChartTheme\(\) \{([\s\S]*?)\n\t\}/)?.[1];
	expect(update).toContain('resolveChartTokens(getComputedStyle(chartContainer))');
	expect(update).toContain('chart.applyOptions(options.chart)');
	expect(update).toContain('series?.applyOptions(options.line)');
	expect(update).not.toMatch(/fetch|fitContent|setVisible|scrollTo/);
	expect(source).toContain('onThemeChange(updateChartTheme)');
});

it('connects the named chart, instructions, summary and complete native data disclosure', () => {
	const body = render(PriceChart, {
		props: {
			data: [
				{ time: 20, value: 2 },
				{ time: 10, value: 1 },
				{ time: 20, value: 3 }
			],
			selectedMarket: { exchange: 'Example', pair: 'TOKEN/VOI', trading_pair_id: 1 },
			selectedPeriod: '7d',
			onPeriodChange: vi.fn()
		}
	}).body;
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
	expect(rows?.match(/<tr>/g)).toHaveLength(3);
	expect(body).toContain('Quote unit not stated for this fallback chart');
	expect(body).toContain('>Price</th>');
	expect(rows).toContain('3.000000');
});
it('wires pointer and keyboard through the shared inspection state and clears on input changes', () => {
	const source = readFileSync(new URL('./PriceChart.svelte', import.meta.url), 'utf8');
	expect(source).toContain('onkeydown={handleInspectionKey}');
	expect(source).toContain('inspect(inspection, { key: event.key }, description.observations)');
	expect(source).toContain('inspect(inspection, { pointer: index }, description.observations)');
	expect(source).toContain('inspect(inspection, { reset: true }, description.observations)');
	for (const dependency of ['data', 'selectedMarket', 'selectedPeriod'])
		expect(source).toContain('void ' + dependency + ';');
	expect(source).toContain('subscribeCrosshairMove(handleCrosshairMove)');
	expect(source).not.toMatch(/\.focus\(/);
});
