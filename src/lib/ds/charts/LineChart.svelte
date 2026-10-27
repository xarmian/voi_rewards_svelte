<script module lang="ts">
	import type { ChartContext } from './types';
	export type LineChartProps = {
		ctx: ChartContext;
		points: { x: number | string | Date; y: number }[];
		area?: boolean;
		labelLatest?: boolean;
		format?: (n: number) => string;
		tone?: 'accent' | 'hi';
	};
</script>

<script lang="ts">
	import { line, area as areaShape, curveMonotoneX } from 'd3-shape';
	import { compact } from '../format';
	let {
		ctx,
		points,
		area = true,
		labelLatest = true,
		format = compact,
		tone = 'accent'
	}: LineChartProps = $props();
	let plotted = $derived(
		points
			.map((p) => ({ x: ctx.x(p.x) + ctx.bandwidth / 2, y: ctx.y(p.y), value: p.y }))
			.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.value))
	);
	let linePath = $derived(
		line<(typeof plotted)[number]>()
			.x((p) => p.x)
			.y((p) => p.y)
			.curve(curveMonotoneX)(plotted) ?? ''
	);
	let areaPath = $derived(
		areaShape<(typeof plotted)[number]>()
			.x((p) => p.x)
			.y0(ctx.height - ctx.margin.bottom)
			.y1((p) => p.y)
			.curve(curveMonotoneX)(plotted) ?? ''
	);
	let latest = $derived(plotted[plotted.length - 1]);
</script>

{#if plotted.length}
	{#if area}<path d={areaPath} class={tone === 'hi' ? 'fill-hi-soft' : 'fill-accent-soft'} />{/if}
	<path
		d={linePath}
		fill="none"
		class={tone === 'hi' ? 'stroke-hi' : 'stroke-accent-fill'}
		stroke-width="2.5"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	{#if labelLatest && latest}<text
			x={latest.x - 6}
			y={Math.max(ctx.margin.top + 12, latest.y - 8)}
			text-anchor="end"
			class="num fill-ink text-label"
			font-weight="700">{format(latest.value)}</text
		>{/if}
{/if}
