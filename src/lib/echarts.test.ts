import { expect, test, vi } from 'vitest';
import * as core from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
	AxisPointerComponent,
	GridComponent,
	LegendPlainComponent,
	TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

vi.mock('echarts/core', async (importOriginal) => {
	const actual = await importOriginal<typeof import('echarts/core')>();
	return { ...actual, use: vi.fn(actual.use) };
});

test('registers exactly the charts, components and renderer used by the four consumers', async () => {
	await import('./echarts');
	// Tooltip also installs AxisPointer internally. Check explicit registration too,
	// so deleting any entry is caught even when another installer supplies it.
	expect(core.use).toHaveBeenCalledExactlyOnceWith([
		LineChart,
		BarChart,
		GridComponent,
		TooltipComponent,
		LegendPlainComponent,
		AxisPointerComponent,
		CanvasRenderer
	]);
	for (const type of [
		'series.line',
		'series.bar',
		'grid',
		'xAxis.category',
		'yAxis.value',
		'tooltip',
		'legend.plain',
		'axisPointer'
	]) {
		expect(core.ComponentModel.hasClass(type), type).toBe(true);
	}
});
