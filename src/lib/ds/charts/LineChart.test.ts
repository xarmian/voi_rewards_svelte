import { test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import LineChart from './LineChart.svelte';
import type { ChartContext } from './types';

const ctx: ChartContext = {
	width: 320,
	height: 230,
	x: Number,
	y: Number,
	bandwidth: 0,
	margin: { top: 20, right: 10, bottom: 28, left: 48 }
};
const points = [
	{ x: 60, y: 120 },
	{ x: 160, y: 80 },
	{ x: 260, y: 60 }
];
const texts = (html: string) => [...html.matchAll(/<text\b[^>]*>/g)].map((m) => m[0]);

test('latest-value label has a surface-coloured halo so the line never runs through the text', () => {
	const html = render(LineChart, { props: { ctx, points, format: String } }).body;
	const labels = texts(html);
	assert.equal(labels.length, 1);
	const label = labels[0];
	assert.match(label, /paint-order="stroke"/);
	const width = Number(label.match(/stroke-width="([^"]*)"/)?.[1]);
	assert.ok(width > 0, `stroke-width ${width}`);
	assert.match(label, /stroke-linejoin="round"/);
	const classes = label.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
	for (const name of ['stroke-surface', 'num', 'fill-ink', 'text-label'])
		assert.ok(classes.includes(name), name);
	assert.match(label, /text-anchor="end"/);
	assert.match(label, /x="254"/);
	assert.match(label, /y="52"/);
	assert.match(html, /<text\b[^>]*>60<\/text>/);
});

test('labelLatest={false} renders no latest-value label', () => {
	const html = render(LineChart, { props: { ctx, points, labelLatest: false } }).body;
	assert.equal(texts(html).length, 0);
});
