import { expect, test, vi } from 'vitest';
import { render } from 'svelte/server';
import Header from '$lib/ds/Header/Header.svelte';
import Page from './+page.svelte';
import * as route from './+page';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/faqData', () => ({
	// Same shape as generateFaqData.js: question markdown is preserved.
	faqData: [
		{
			question: 'How do I get started running a node?',
			answer: 'Setup answer.\n\nMore setup.',
			category: 'Node Operation',
			sort: 4
		},
		{
			question: 'Can **Locked** or Non-vested Voi tokens earn block rewards?',
			answer: '**Locked** answer.\n\nMore details.',
			category: 'Staking',
			sort: 13
		}
	]
}));
const highlights = [
	{
		question: 'Can **Locked** or Non-vested Voi tokens earn block rewards?',
		slug: 'can-locked-or-non-vested-voi-tokens-earn-block-rewards-',
		excerpt: 'Locked answer.'
	},
	{
		question: 'How do I get started running a node?',
		slug: 'how-do-i-get-started-running-a-node-',
		excerpt: 'Setup answer.'
	}
];
// Copied from origin/main, independent of the moved guideGroups data.
const originalGroups = [
	[
		'https://docs.voi.network/',
		'https://voinetwork.github.io/voi-swarm',
		'https://github.com/GalaxyPay/func',
		'https://d13.co/posts/set-up-voi-participation-node/',
		'https://github.com/xarmian/voinode',
		'https://github.com/scholtz/dappnode-participation-node-voitest/blob/main/README.md'
	],
	[
		'https://voinetwork.github.io/voi-swarm/advanced-node-running/relay-node/',
		'https://voinetwork.github.io/voi-swarm/installation/system-requirements/'
	],
	[
		'https://voi.network',
		'https://discord.gg/vnFbrJrHeW',
		'https://twitter.com/Voi_Net',
		'https://www.reddit.com/r/Voi_Net/'
	]
];
const markup = (faqHighlights = highlights) =>
	render(Page, { props: { data: { faqHighlights } } }).body;
const plain = (html: string) =>
	html
		.replace(/<[^>]*>/g, '')
		.replace(/\s+/g, ' ')
		.trim();

test('loads both exact stored questions with derived excerpts and FAQ-compatible slugs', () => {
	expect(route.prerender).toBe(true);
	expect(route.load()).toEqual({ faqHighlights: highlights });
});

test('three ordered steps link to guides, calculator and wallet check', () => {
	const html = markup();
	const lists = [...html.matchAll(/<ol\b[^>]*>([\s\S]*?)<\/ol>/g)];
	expect(lists).toHaveLength(1);
	const steps = [...lists[0][1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
	expect(steps).toHaveLength(3);
	['Read a guide', 'Estimate rewards', "Check it's working"].forEach((title, i) => {
		expect(plain(steps[i])).toContain(title);
		expect(plain(steps[i])).toContain(String(i + 1));
		expect([...steps[i].matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1])).toEqual([
			['#guides', '/calculator', '#wallet-check'][i]
		]);
	});
	for (const id of ['guides', 'wallet-check']) expect(html).toContain(`id="${id}"`);
});

test('preserves every original guide in group order with accessible external links', () => {
	const html = markup();
	const lists = [...html.matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/g)].map((m) => m[1]);
	for (const urls of originalGroups) {
		const list = lists.find((value) => value.includes(`href="${urls[0]}"`));
		expect(list).toBeDefined();
		const anchors = [...list!.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g)];
		expect(anchors.map((m) => m[1])).toEqual(urls);
		for (const [anchor] of anchors) {
			expect(anchor).toContain('target="_blank"');
			expect(anchor).toContain('rel="noopener noreferrer"');
			expect(anchor).toMatch(/class="sr-only"[^>]*> \(opens in a new tab\)<\/span>/);
		}
	}
	expect(html).toContain('More Links and Resources');
	expect(html).toMatch(/<strong[^>]*>Technical Documentation<\/strong>/);
});

test('wallet search is labelled and its ids cannot collide with Header compact searches', () => {
	const html = markup();
	expect(html).toMatch(/<form[^>]*id="node-wallet-check-form"[^>]*aria-label="Node wallet check"/);
	expect(html).toContain('id="node-wallet-check-input"');
	expect(html).toContain('for="node-wallet-check-input"');
	const header = render(Header, { props: { variant: 'bar', current: null } }).body;
	expect(header).toContain('id="ds-search-header-input"');
	const ids = [...(html + header).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
	expect(new Set(ids).size).toBe(ids.length);
});

test('vanity generator has a literal reload link', () => {
	expect(markup()).toMatch(
		/<a href="\/vanity" data-sveltekit-reload(?:="")?>Vanity address generator<\/a>/
	);
});

test('native FAQ disclosures link to exact FAQ hashes and all questions', () => {
	const html = markup();
	const details = [...html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)];
	expect(details).toHaveLength(2);
	for (const [i, highlight] of highlights.entries()) {
		expect(details[i][1]).toMatch(/<summary\b[^>]*>.+?<\/summary>/s);
		expect(plain(details[i][1])).toContain(highlight.question.replaceAll('**', ''));
		expect(details[i][1]).toContain(highlight.excerpt);
		expect(details[i][1]).toMatch(
			new RegExp(`href="/faq#${highlight.slug}"[^>]*>Read the full answer</a>`)
		);
	}
	expect(html).toMatch(/<a[^>]*href="\/faq"[^>]*>See all questions<\/a>/);
});

test('missing FAQ data leaves the hub usable', () => {
	const html = markup([]);
	expect(html).not.toContain('<details');
	for (const href of [
		'#guides',
		'/calculator',
		'#wallet-check',
		'/vanity',
		...originalGroups.flat()
	]) {
		expect(html).toContain(`href="${href}"`);
	}
	expect(html).toContain('id="node-wallet-check-input"');
	expect(html).toContain('id="guides"');
	expect(html).toContain('id="wallet-check"');
});
