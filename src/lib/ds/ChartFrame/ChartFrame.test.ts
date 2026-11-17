import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import ChartFrame from './ChartFrame.svelte';
import LineChart from '../charts/LineChart.svelte';
import BarsVsExpected from '../charts/BarsVsExpected.svelte';
import type { ChartContext, XSpec } from '../charts/types';
import { makeX, tickValues } from '../charts/scales';
import { annotationsFor } from '../../data/chartEvents';
import { blockHistory } from '../../../routes/ds/fixtures';
const annotations = annotationsFor('blocksVsExpected', 'epoch');
const summary = 'Blocks earned by epoch compared with expected blocks.';
const data = {
	columns: ['Epoch', 'Blocks', 'Expected'],
	rows: blockHistory.map((d) => [d.epoch, d.blocks, d.expected]),
	caption: 'Twelve completed epochs'
};
const x: XSpec = { kind: 'band', values: blockHistory.map((d) => d.epoch) };
const y = { domain: [0, 30000] as [number, number] };
const bars = createRawSnippet<[ChartContext]>((ctx) => ({
	render: () =>
		`<g>${render(BarsVsExpected, { props: { ctx: ctx(), bars: blockHistory.map((d) => ({ x: d.epoch, value: d.blocks, expected: d.expected })) } }).body}</g>`
}));
const line = createRawSnippet<[ChartContext]>((ctx) => ({
	render: () =>
		`<g>${render(LineChart, { props: { ctx: ctx(), points: [...blockHistory.map((d) => ({ x: d.epoch, y: d.blocks })), { x: 104, y: NaN }] } }).body}</g>`
}));
const props = { title: 'Blocks', summary, data, x, y, annotations, children: bars };
for (const [name, children] of [
	['bars', bars],
	['line', line]
] as const) {
	test(`${name}: interactive plot, annotation notes, axes, data table and live region`, () => {
		const html = render(ChartFrame, { props: { ...props, children } }).body;
		const svg = html.match(/<svg[^>]*>/)?.[0] ?? '';
		for (const attr of [
			'tabindex="0"',
			'role="group"',
			'aria-roledescription="chart"',
			`aria-label="${summary}"`,
			'aria-describedby="ds-chart-blocks-notes"'
		])
			assert.ok(svg.includes(attr), attr);
		assert.doesNotMatch(svg, /role="img"/);
		assert.match(html, /<ul id="ds-chart-blocks-notes"/);
		assert.ok(html.includes(annotations[0].detail!));
		const ticks = [...html.matchAll(/<text[^>]*class="[^"]*fill-ink-muted[^>]*>/g)];
		assert.ok(ticks.length > 2);
		for (const tick of ticks) assert.match(tick[0], /font-size="11"/);
		assert.match(html, /<summary[^>]*>View data<\/summary>/);
		assert.match(html, /<caption[^>]*>Twelve completed epochs<\/caption>/);
		const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
		assert.equal((body.match(/<tr\b/g) ?? []).length, data.rows.length);
		assert.doesNotMatch(html, /\bd="[^"]*NaN/);
		assert.match(html, /aria-live="polite"/);
	});
}
test('outlier uses exactly one highlighted bar and the 148% label', () => {
	const html = render(ChartFrame, { props }).body;
	assert.match(html, />148%<\/text>/);
	const highlighted = [...html.matchAll(/<rect[^>]*class="([^"]*)"[^>]*>/g)].filter((m) =>
		m[1].split(/\s+/).includes('fill-hi')
	);
	assert.equal(highlighted.length, 1);
	assert.match(html, /stroke-expected-halo/);
});
test('loading and error never render data', () => {
	const loading = render(ChartFrame, { props: { ...props, state: 'loading' } }).body;
	assert.match(loading, /aria-busy="true"/);
	assert.match(loading, /Loading Blocks…/);
	assert.doesNotMatch(loading, /<svg|<table/);
	const error = render(ChartFrame, {
		props: { ...props, state: 'error', onretry: () => undefined }
	}).body;
	assert.match(error, /role="alert"/);
	assert.match(error, /Retry/);
	assert.doesNotMatch(error, /<svg|<table/);
});
test('empty retains an empty captioned table and stale retains data with freshness', () => {
	const empty = render(ChartFrame, {
		props: { ...props, state: 'empty', data: { ...data, rows: [] } }
	}).body;
	assert.match(empty, /No observations in this range/);
	assert.match(empty, /<table/);
	assert.doesNotMatch(empty, /<tbody>[^]*?<tr/);
	const stale = render(ChartFrame, {
		props: { ...props, state: 'stale', asOf: '2026-10-25' }
	}).body;
	assert.match(stale, /as of /);
	assert.match(stale, /<svg/);
});
test('out-of-domain annotations remain in notes but have no plot label', () => {
	const html = render(ChartFrame, {
		props: {
			...props,
			annotations: [
				{
					id: 'outside',
					at: 200,
					label: 'Outside domain',
					detail: 'Note remains available',
					tone: 'neutral'
				}
			]
		}
	}).body;
	assert.match(html, /Note remains available/);
	assert.doesNotMatch(html, />Outside domain<\/text>/);
});

test('stale resource retains its own absolute time and has a scoped retry', () => {
	const html = render(ChartFrame, {
		props: { ...props, state: 'stale', asOf: '2026-10-25T02:38:47Z', onretry() {} }
	}).body;
	assert.match(html.replace(/<[^>]*>/g, ' '), /!\s+Stale - data as of 2026-10-25 02:38:47 UTC/);
	assert.match(html, /Retry/);
	assert.doesNotMatch(html, /overflow-x-auto/);
});

test('line preserves a missing observation as a gap instead of connecting across it', () => {
	const ctx: ChartContext = {
		width: 300,
		height: 230,
		x: Number,
		y: Number,
		bandwidth: 0,
		margin: { top: 20, right: 10, bottom: 28, left: 48 }
	};
	const html = render(LineChart, {
		props: {
			ctx,
			area: false,
			labelLatest: false,
			points: [
				{ x: 1, y: 10 },
				{ x: 2, y: NaN },
				{ x: 3, y: 30 }
			]
		}
	}).body;
	const path = html.match(/d="([^"]*)"/)?.[1] ?? '';
	assert.equal((path.match(/M/g) ?? []).length, 2);
	assert.doesNotMatch(path, /NaN/);
});

test('the plot container is a programmatic focus target so Retry can keep focus inside the card', () => {
	for (const state of ['error', 'stale', 'loading'] as const) {
		const html = render(ChartFrame, { props: { ...props, state, onretry: () => {} } }).body;
		assert.match(
			html,
			/<div[^>]*tabindex="-1"[^>]*class="relative min-w-0|<div[^>]*class="relative min-w-0[^"]*"[^>]*tabindex="-1"/
		);
	}
});

function xTickTexts(html: string) {
	// X tick labels sit on the baseline at height - 8 (232 for the default 240 px height).
	return [...html.matchAll(/<text([^>]*y="232"[^>]*)>([^<]*)<\/text>/g)].map((m) => ({
		x: Number(m[1].match(/\bx="([^"]*)"/)?.[1]),
		anchor: m[1].match(/text-anchor="([^"]*)"/)?.[1],
		label: m[2]
	}));
}
test('long date band labels are spaced to their width and stay inside the svg', () => {
	const days = Array.from({ length: 30 }, (_, i) =>
		new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)
	);
	const html = render(ChartFrame, {
		props: {
			...props,
			annotations: [],
			data: { ...data, rows: days.map((d) => [d, 1, 1]) },
			x: { kind: 'band', values: days },
			children: createRawSnippet<[ChartContext]>(() => ({ render: () => '<g></g>' }))
		}
	}).body;
	const svgWidth = Number(html.match(/<svg[^>]*\bwidth="([^"]*)"/)?.[1]);
	const ticks = xTickTexts(html);
	assert.ok(ticks.length > 1);
	for (let i = 1; i < ticks.length; i++)
		assert.ok(ticks[i].x - ticks[i - 1].x >= 10 * 6.6 + 12 - 1e-8, `${ticks[i].label} too close`);
	for (const tick of ticks) {
		const labelWidth = tick.label.length * 6.6;
		if (tick.anchor === 'middle') {
			assert.ok(tick.x - labelWidth / 2 >= 0, `${tick.label} spills left`);
			assert.ok(tick.x + labelWidth / 2 <= svgWidth, `${tick.label} spills right`);
		}
	}
});
test('short band labels keep the 44 px tick count on a desktop width', () => {
	const epochs = Array.from({ length: 30 }, (_, i) => i + 1);
	const html = render(ChartFrame, {
		props: {
			...props,
			annotations: [],
			data: { ...data, rows: epochs.map((e) => [e, 1, 1]) },
			x: { kind: 'band', values: epochs },
			children: createRawSnippet<[ChartContext]>(() => ({ render: () => '<g></g>' }))
		}
	}).body;
	// Default width 640, y labels up to "30k" keep the 48 px left column, right margin 16.
	const plotWidth = 640 - 48 - 16;
	const expected = tickValues(
		makeX({ kind: 'band', values: epochs }, [48, 48 + plotWidth]),
		plotWidth,
		44
	);
	assert.equal(xTickTexts(html).length, expected.length);
});
