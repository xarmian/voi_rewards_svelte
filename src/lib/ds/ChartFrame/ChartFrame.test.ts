import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import ChartFrame from './ChartFrame.svelte';
import LineChart from '../charts/LineChart.svelte';
import BarsVsExpected from '../charts/BarsVsExpected.svelte';
import type { ChartContext, XSpec } from '../charts/types';
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
	assert.match(empty, /No data/);
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
