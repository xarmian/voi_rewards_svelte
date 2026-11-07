import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import PriceChart from './PriceChart.svelte';

it.each(['24h', '7d'] as const)('names the period group and exposes selected %s', (selectedPeriod) => {
	const body = render(PriceChart, { props: { data: [], selectedPeriod, onPeriodChange: vi.fn() } }).body;
	expect(body).toMatch(/role="group" aria-label="Period"/);
	const buttons = [...body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
	for (const [value, label] of [['24h', '24H'], ['7d', '7D']]) {
		const button = buttons.find((b) => b[2].includes(label));
		expect(button?.[1]).toContain(`aria-pressed="${selectedPeriod === value}"`);
	}
});

it('updates the mounted price series and layout without refetching or changing the range', () => {
	const source = readFileSync(new URL('./PriceChart.svelte', import.meta.url), 'utf8');
	const update = source.match(/function updateChartTheme\(\) \{([\s\S]*?)\n\t\}/)?.[1];
	expect(update).toContain('resolveChartTokens(getComputedStyle(chartContainer))');
	expect(update).toContain('chart.applyOptions(options.chart)');
	expect(update).toContain('series?.applyOptions(options.line)');
	expect(update).not.toMatch(/fetch|fitContent|setVisible|scrollTo/);
	expect(source).toContain('onThemeChange(updateChartTheme)');
});
