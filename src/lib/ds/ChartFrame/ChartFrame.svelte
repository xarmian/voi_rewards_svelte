<script module lang="ts">
	import type { Snippet } from 'svelte';
	import type { DataState } from '../types';
	import type { Annotation, ChartContext, ChartData, ChartLegend, XSpec } from '../charts/types';
	export type ChartFrameProps = {
		title: string;
		headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
		summary: string;
		legend?: ChartLegend[];
		annotations?: Annotation[];
		data: ChartData;
		state?: DataState;
		onretry?: () => void;
		asOf?: string | number | Date;
		actions?: Snippet;
		children: Snippet<[ChartContext]>;
		x: XSpec;
		y: { domain: [number, number]; format?: (n: number) => string };
		markX?: (row: (string | number)[]) => number | string | Date;
		describe?: (rowIndex: number) => string;
		height?: number;
		/** Keep titles unique on a page, or pass a unique id. */
		id?: string;
	};
</script>

<script lang="ts">
	import Card from '../Card/Card.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import { ago, compact } from '../format';
	import { slug } from '../slug';
	import { makeX, makeY, tickValues } from '../charts/scales';
	import { layoutAnnotations } from '../charts/annotations';
	let {
		title,
		headingLevel = 2,
		summary,
		legend = [],
		annotations = [],
		data,
		state: dataState = 'ready',
		onretry,
		asOf,
		actions,
		children,
		x,
		y,
		markX = (row) => row[0],
		describe,
		height = 240,
		id = `ds-chart-${slug(title)}`
	}: ChartFrameProps = $props();
	let container: HTMLDivElement | undefined = $state();
	let width = $state(640);
	let active: number | null = $state(null);
	let announcement = $state('');
	const left = 48;
	const right = 16;
	let plotWidth = $derived(Math.max(1, width - left - right));
	let xScale = $derived(makeX(x, [left, left + plotWidth]));
	let visibleAnnotations = $derived(
		annotations.filter((a) =>
			(Array.isArray(a.at) ? a.at : [a.at]).every((at) => xScale.contains(at))
		)
	);
	let labelItems = $derived(
		visibleAnnotations.map((a) => ({
			x:
				xScale.position(Array.isArray(a.at) ? a.at[0] : a.at) +
				(Array.isArray(a.at) ? 0 : xScale.bandwidth / 2) -
				left,
			width: a.label.length * 7.5
		}))
	);
	let labels = $derived(layoutAnnotations(labelItems, plotWidth));
	let rows = $derived(labels.length ? Math.max(...labels.map((l) => l.row)) + 1 : 0);
	let margin = $derived({ top: 24 + rows * 16, right, bottom: 28, left });
	let yScale = $derived(makeY(y.domain, [height - margin.bottom, margin.top]));
	let ctx: ChartContext = $derived({
		width,
		height,
		x: xScale.position,
		bandwidth: xScale.bandwidth,
		y: yScale,
		margin
	});
	let xTicks = $derived(tickValues(xScale, plotWidth));
	let yTicks = $derived(yScale.ticks(4));
	let marks = $derived(
		data.rows
			.map((row, index) => ({ index, center: xScale.position(markX(row)) + xScale.bandwidth / 2 }))
			.filter((m) => Number.isFinite(m.center))
			.sort((a, b) => a.center - b.center)
	);
	let activeMark = $derived(marks.find((m) => m.index === active));
	let activeText = $derived(activeMark ? describeMark(activeMark.index) : '');
	let tooltipWidth = $derived(Math.max(1, Math.min(280, width - 16)));
	let tooltipLeft = $derived(
		Math.max(8, Math.min((activeMark?.center ?? left) + 12, width - tooltipWidth - 8))
	);
	const swatches = { fill: 'bg-accent-fill', hi: 'bg-hi', 'series-3': 'bg-series-3' };
	function describeMark(index: number) {
		return (
			describe?.(index) ??
			data.columns.map((column, j) => `${column}: ${data.rows[index]?.[j] ?? ''}`).join(' · ')
		);
	}
	function clear() {
		active = null;
		announcement = '';
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			clear();
			return;
		}
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !marks.length) return;
		event.preventDefault();
		const current = marks.findIndex((m) => m.index === active);
		let next: number;
		if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = marks.length - 1;
		else if (current < 0) next = event.key === 'ArrowRight' ? 0 : marks.length - 1;
		else
			next = Math.max(
				0,
				Math.min(marks.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1))
			);
		active = marks[next].index;
		announcement = describeMark(active);
	}
	function tickLabel(value: number | string | Date) {
		return value instanceof Date
			? value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
			: String(value);
	}
	$effect(() => {
		const element = container;
		if (!element) return;
		const measure = () => {
			const measured = element.getBoundingClientRect().width;
			if (measured > 0) width = measured;
		};
		measure();
		const observer =
			typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
		observer?.observe(element);
		return () => observer?.disconnect();
	});
	$effect(() => {
		void data;
		void x;
		void dataState;
		clear();
	});
</script>

<Card {title} {headingLevel} {actions} id={`${id}-title`}>
	<div
		bind:this={container}
		class="relative min-w-0"
		aria-busy={dataState === 'loading' ? 'true' : undefined}
	>
		{#if dataState === 'loading'}
			<div class="rounded-ds-xs bg-grid" style:height={`${height}px`}>
				<span class="sr-only">Loading {title}…</span>
			</div>
		{:else if dataState === 'error'}
			<InlineAlert message={`Couldn't load ${title}.`} {onretry} />
		{:else if dataState === 'empty'}
			<div
				class="flex items-center justify-center text-sm text-ink-muted"
				style:height={`${height}px`}
			>
				No data
			</div>
		{:else}
			<!-- A chart is intentionally one keyboard-operable group, as specified in §2.10. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<svg
				{width}
				{height}
				viewBox={`0 0 ${width} ${height}`}
				tabindex="0"
				role="group"
				aria-roledescription="chart"
				aria-label={summary}
				aria-describedby={annotations.length ? `${id}-notes` : undefined}
				class="block"
				onkeydown={keydown}
				onpointerleave={clear}
				onblur={clear}
			>
				<g aria-hidden="true">
					{#each yTicks as value (value)}
						<line
							x1={left}
							x2={width - right}
							y1={yScale(value)}
							y2={yScale(value)}
							stroke-width="1"
							class="stroke-grid"
						/>
						<text
							x={left - 8}
							y={yScale(value)}
							dy="0.35em"
							text-anchor="end"
							font-size="11"
							class="fill-ink-muted num">{(y.format ?? compact)(value)}</text
						>
					{/each}
					{#each xTicks as value (String(value))}
						{@const position = xScale.position(value) + xScale.bandwidth / 2}
						<text
							x={position}
							y={height - 8}
							text-anchor={position > width - 32 ? 'end' : 'middle'}
							font-size="11"
							class="fill-ink-muted num">{tickLabel(value)}</text
						>
					{/each}
					{@render children(ctx)}
					{#each visibleAnnotations as annotation, index (annotation.id)}
						{@const layout = labels[index]}
						{@const item = labelItems[index]}
						{@const labelWidth = Math.min(item.width, plotWidth)}
						{@const labelX =
							left +
							(layout.anchor === 'end'
								? Math.max(labelWidth, item.x)
								: Math.min(item.x, plotWidth - labelWidth))}
						{@const labelY = 14 + layout.row * 16}
						{#if Array.isArray(annotation.at)}
							<rect
								x={xScale.position(annotation.at[0])}
								y={margin.top}
								width={Math.max(
									0,
									xScale.position(annotation.at[1]) +
										xScale.bandwidth -
										xScale.position(annotation.at[0])
								)}
								height={height - margin.top - margin.bottom}
								class="fill-hi"
								fill-opacity=".08"
							/>
						{:else}
							<line
								x1={left + item.x}
								x2={left + item.x}
								y1={margin.top}
								y2={labelY + 4}
								stroke-width="1"
								class={annotation.tone === 'hi' ? 'stroke-hi' : 'stroke-ink'}
							/>
						{/if}
						<text
							x={labelX}
							y={labelY}
							text-anchor={layout.anchor}
							class="fill-ink text-label"
							font-weight="700">{annotation.label}</text
						>
					{/each}
					{#if activeMark}<line
							x1={activeMark.center}
							x2={activeMark.center}
							y1={margin.top}
							y2={height - margin.bottom}
							stroke-width="1"
							class="stroke-ink-muted"
						/>{/if}
					{#each marks as mark, index (mark.index)}
						{@const start = index === 0 ? left : (marks[index - 1].center + mark.center) / 2}
						{@const end =
							index === marks.length - 1
								? width - right
								: (mark.center + marks[index + 1].center) / 2}
						<rect
							x={start}
							y={margin.top}
							width={Math.max(0, end - start)}
							height={height - margin.top - margin.bottom}
							fill="transparent"
							onpointerenter={() => {
								active = mark.index;
							}}
						/>
					{/each}
				</g>
			</svg>
			{#if activeMark}<div
					aria-hidden="true"
					class="pointer-events-none absolute overflow-hidden break-words rounded-ds-sm bg-surface p-2 text-label text-ink shadow-pop"
					style:left={`${tooltipLeft}px`}
					style:top={`${margin.top + 8}px`}
					style:width={`${tooltipWidth}px`}
					style:max-height={`${Math.max(1, height - margin.top - margin.bottom - 16)}px`}
				>
					{activeText}
				</div>{/if}
		{/if}
	</div>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
	{#if legend.length && dataState !== 'loading' && dataState !== 'error'}
		<ul aria-label={`${title} legend`} class="mt-3 flex flex-wrap gap-3 text-label text-ink-muted">
			{#each legend as item (item.label)}<li class="flex items-center gap-1">
					{#if item.swatch === 'expected'}<svg width="16" height="12" aria-hidden="true"
							><line
								x1="1"
								x2="15"
								y1="6"
								y2="6"
								stroke-width="4"
								class="stroke-expected-halo"
							/><line x1="1" x2="15" y1="6" y2="6" stroke-width="2" class="stroke-expected" /></svg
						>
					{:else}<span aria-hidden="true" class="inline-block h-2 w-2 {swatches[item.swatch]}"
						></span>{/if}{item.label}
				</li>{/each}
		</ul>
	{/if}
	{#if annotations.length}<ul id={`${id}-notes`} class="mt-3 space-y-1 text-label text-ink-muted">
			{#each annotations as annotation (annotation.id)}<li>
					{annotation.detail ?? annotation.label}
				</li>{/each}
		</ul>{/if}
	{#if dataState === 'stale'}<p class="mt-2 text-label text-warn">
			<span aria-hidden="true">!</span> as of {ago(asOf)}
		</p>{/if}
	{#if dataState !== 'loading' && dataState !== 'error'}
		<details class="mt-3 text-sm">
			<summary class="w-fit cursor-pointer text-accent">View data</summary>
			<div class="mt-2 overflow-x-auto">
				<table class="w-full text-sm">
					<caption class="mb-2 text-start text-label text-ink-muted">{data.caption}</caption><thead
						><tr
							>{#each data.columns as column, index (index)}<th
									scope="col"
									class="border-b border-line p-2 text-start text-label">{column}</th
								>{/each}</tr
						></thead
					><tbody
						>{#each dataState === 'empty' ? [] : data.rows as row, index (index)}<tr
								>{#each row as cell, column (column)}<td
										class="border-b border-line p-2 {typeof cell === 'number'
											? 'text-end num'
											: 'text-start'}">{cell}</td
									>{/each}</tr
							>{/each}</tbody
					>
				</table>
			</div>
		</details>
	{/if}
</Card>
