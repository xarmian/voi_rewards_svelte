import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import { Card, StatTile, Sparkline, HealthRing, StatusPill, CopyButton } from './index';
import type { DataState } from './types';

const children = createRawSnippet(() => ({ render: () => '<p>Card content</p>' }));
type StateProps = { state?: DataState; onretry?: () => void; asOf?: string };
const fixtures = [
	{
		name: 'StatTile',
		body: (extra: StateProps) =>
			render(StatTile, { props: { label: 'Example', value: '98765', ...extra } }).body
	},
	{
		name: 'Sparkline',
		body: (extra: StateProps) =>
			render(Sparkline, { props: { label: 'Example', values: [98765, 98766], ...extra } }).body
	},
	{
		name: 'HealthRing',
		body: (extra: StateProps) =>
			render(HealthRing, {
				props: { label: 'Example', value: 98765, total: 99999, tone: 'ok', ...extra }
			}).body
	}
];

describe('data states', () => {
	for (const { name, body } of fixtures) {
		test(`${name}: loading hides data and announces loading`, () => {
			const html = body({ state: 'loading' });
			assert.match(html, /aria-busy="true"/);
			assert.match(html, /class="sr-only">Loading Example…/);
			assert.doesNotMatch(html, /98765|98766|99999/);
			assert.doesNotMatch(html, /animate-/);
		});
		test(`${name}: error hides data and retry is optional`, () => {
			const html = body({ state: 'error' });
			assert.match(html, /role="alert"/);
			assert.doesNotMatch(html, /98765|98766|99999|<button/);
			const retry = body({ state: 'error', onretry: () => {} });
			assert.match(retry, /<button[^>]*>[\s\S]*Retry/);
			assert.doesNotMatch(retry, /98765|98766|99999/);
		});
		test(`${name}: stale retains data with a timestamp`, () => {
			assert.match(body({ state: 'stale', asOf: '2026-10-25T12:00:00Z' }), /as of /);
		});
		test(`${name}: empty`, () => {
			const html = body({ state: 'empty' });
			assert.match(html, name === 'StatTile' ? /—/ : /No data/);
			assert.doesNotMatch(html, /98765|98766|99999/);
		});
	}
});

describe('StatTile', () => {
	test('linked tile has exactly one interaction and a precise accessible name', () => {
		const html = render(StatTile, {
			props: {
				label: 'Stake',
				value: '725.24M',
				unit: 'VOI',
				href: '/ds',
				trend: [1, 2],
				change: { value: 0.71, label: '24 hours' }
			}
		}).body;
		assert.equal((html.match(/<a\b/g) ?? []).length, 1);
		assert.doesNotMatch(html, /<button/);
		assert.match(html, /aria-label="Stake: 725.24M VOI"/);
	});
	test('href loading and error remain containers with optional retry', () => {
		for (const state of ['loading', 'error'] as const) {
			const html = render(StatTile, {
				props: { label: 'Stake', value: '98765', href: '/ds', state, onretry: () => {} }
			}).body;
			assert.doesNotMatch(html, /<a\b|98765/);
			assert.equal((html.match(/<button\b/g) ?? []).length, state === 'error' ? 1 : 0);
		}
	});
	test('change has sign words and decorative visual signs', () => {
		for (const [value, word, visual] of [
			[0.71, 'up', '+0.71%'],
			[-1.01, 'down', '−1.01%']
		] as const) {
			const html = render(StatTile, {
				props: { label: 'Price', value: '$1', change: { value, label: '24 hours' } }
			}).body;
			assert.ok(html.includes(`${word} ${Math.abs(value)}%`));
			assert.ok(html.includes(visual));
			assert.match(html, /aria-hidden="true"/);
		}
	});
	test('progress has all accessible attributes', () => {
		const html = render(StatTile, {
			props: {
				label: 'Blocks',
				value: '126,874',
				progress: { value: 126874, max: 216074, label: 'Projected blocks' }
			}
		}).body;
		for (const attr of [
			'role="progressbar"',
			'aria-valuenow="126874"',
			'aria-valuemin="0"',
			'aria-valuemax="216074"',
			'aria-label="Projected blocks"'
		])
			assert.ok(html.includes(attr));
	});
	test('missing value suppresses fallback change, trend and progress', () => {
		const html = render(StatTile, {
			props: {
				label: 'Missing',
				value: '—',
				change: { value: 98765, label: 'change' },
				trend: [98765],
				progress: { value: 98765, max: 99999, label: 'progress' }
			}
		}).body;
		assert.doesNotMatch(html, /98765|99999|progressbar|<svg/);
	});
});

test('Sparkline image has formatted endpoints', () => {
	const html = render(Sparkline, { props: { label: 'APR', values: [18.99, 16.04] } }).body;
	assert.match(html, /role="img"/);
	assert.match(html, /aria-label="APR: from 18.99 to 16.04"/);
});

test('HealthRing: zero total is neutral with no arc', () => {
	const html = render(HealthRing, { props: { value: 0, total: 0, tone: 'danger' } }).body;
	assert.match(html, /No contracts/);
	assert.doesNotMatch(html, /stroke-danger|stroke-dashoffset/);
});

test('stale no-contract and no-sample results retain their timestamp', () => {
	const asOf = '2026-10-25T12:00:00Z';
	const ring = render(HealthRing, { props: { value: 0, total: 0, state: 'stale', asOf } }).body;
	const sparkline = render(Sparkline, {
		props: { values: [], label: 'APR', state: 'stale', asOf }
	}).body;
	assert.match(ring, /No contracts/);
	assert.match(sparkline, /No data/);
	assert.match(ring, /as of /);
	assert.match(sparkline, /as of /);
});

describe('Card', () => {
	test('titled section matches derived heading ID', () => {
		const html = render(Card, { props: { title: 'Node health', headingLevel: 3, children } }).body;
		assert.match(html, /<section[^>]*aria-labelledby="ds-card-node-health"/);
		assert.match(html, /<h3[^>]*id="ds-card-node-health"/);
	});
	test('explicit ID is verbatim', () => {
		const html = render(Card, { props: { title: 'Node health', id: 'custom-ID', children } }).body;
		assert.match(html, /aria-labelledby="custom-ID"/);
		assert.match(html, /id="custom-ID"/);
	});
	test('untitled is a div without a heading or labelledby', () => {
		const html = render(Card, { props: { as: 'section', id: 'unused', children } }).body;
		assert.match(html, /<div/);
		assert.doesNotMatch(html, /<section|<h[1-6]|aria-labelledby|id="unused"/);
	});
});

test('StatusPill glyph is hidden from assistive technology', () => {
	const html = render(StatusPill, { props: { tone: 'ok', label: 'Online' } }).body;
	assert.match(html, /aria-hidden="true">●/);
});

test('CopyButton is a named native button', () => {
	const html = render(CopyButton, { props: { text: 'address', what: 'wallet address' } }).body;
	assert.match(html, /<button type="button"[^>]*aria-label="Copy wallet address"/);
});
