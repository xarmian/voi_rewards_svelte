<script module lang="ts">
	import type { ChartContext } from './types';
	export type BarsVsExpectedProps = {
		ctx: ChartContext;
		bars: { x: number | string; value: number; expected: number }[];
		format?: (n: number) => string;
	};
</script>

<script lang="ts">
	import { compact } from '../format';
	import { classify, ratioLabel } from './bars';
	let { ctx, bars, format = compact }: BarsVsExpectedProps = $props();
	let width = $derived(
		ctx.bandwidth ||
			Math.max(
				1,
				((ctx.width - ctx.margin.left - ctx.margin.right) / Math.max(1, bars.length)) * 0.75
			)
	);
	let baseline = $derived(
		Math.min(ctx.height - ctx.margin.bottom, Math.max(ctx.margin.top, ctx.y(0)))
	);
</script>

{#each bars as bar, index (index)}
	{@const x = ctx.x(bar.x)}
	{@const y = ctx.y(bar.value)}
	{@const tone = classify(bar.value, bar.expected)}
	{#if Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(bar.value)}
		<rect
			{x}
			y={Math.min(y, baseline)}
			{width}
			height={Math.abs(baseline - y)}
			rx="3"
			class={tone === 'hi' ? 'fill-hi' : tone === 'warn' ? 'fill-warn' : 'fill-accent-fill'}
			><title>{format(bar.value)} blocks</title></rect
		>
		{#if Number.isFinite(bar.expected) && Number.isFinite(ctx.y(bar.expected))}
			<line
				x1={x - 3}
				x2={x + width + 3}
				y1={ctx.y(bar.expected)}
				y2={ctx.y(bar.expected)}
				stroke-width="4"
				class="stroke-expected-halo"
			/>
			<line
				x1={x - 3}
				x2={x + width + 3}
				y1={ctx.y(bar.expected)}
				y2={ctx.y(bar.expected)}
				stroke-width="2"
				class="stroke-expected"><title>{format(bar.expected)} expected</title></line
			>
		{/if}
		{#if tone}<text
				x={x + width / 2}
				y={y - 6}
				text-anchor="middle"
				font-size="11"
				font-weight="700"
				class="num {tone === 'hi' ? 'fill-hi-ink' : 'fill-warn'}"
				>{ratioLabel(bar.value, bar.expected)}</text
			>{/if}
	{/if}
{/each}
