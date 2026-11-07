import { expect, it } from 'vitest';
import { formatChartTick } from './chartTicks';

const ts = (iso: string) => Date.parse(iso) / 1000;
it('uses dates at UTC day boundaries and times within each day across midnight', () => {
	const times = ['2026-10-14T23:00:00Z', '2026-10-15T00:00:00Z', '2026-10-15T14:00:00Z'];
	expect(times.map((time) => formatChartTick(ts(time), 2 * 86400))).toEqual([
		'23:00',
		'Oct 15',
		'14:00'
	]);
});
it.each([3600, 86400])('uses only times for a visible range of %s seconds', (span) => {
	expect(formatChartTick(ts('2026-10-15T00:00:00Z'), span)).toBe('00:00');
	expect(formatChartTick(ts('2026-10-15T14:00:00Z'), span)).toBe('14:00');
});
it('accepts chart business days and date strings as UTC boundaries', () => {
	expect(formatChartTick({ year: 2026, month: 10, day: 15 }, 172800)).toBe('Oct 15');
	expect(formatChartTick('2026-10-15', 172800)).toBe('Oct 15');
});

it('connects both chart axes to the formatter and invalidates labels when zoom crosses one day', async () => {
	const { readFileSync } = await import('node:fs');
	for (const name of ['OHLCVChart', 'PriceChart']) {
		const source = readFileSync(new URL(`../components/${name}.svelte`, import.meta.url), 'utf8');
		expect(source).toContain('tickMarkFormatter: formatAxisTick');
		expect(source).toContain('formatChartTick(time, visibleSeconds)');
		expect(source).toContain('subscribeVisibleTimeRangeChange(updateTickRange)');
		expect(source).toContain('unsubscribeVisibleTimeRangeChange(updateTickRange)');
	}
});
