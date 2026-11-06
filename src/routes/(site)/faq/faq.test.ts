import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { navCurrent } from '$lib/ds/Header/nav';

const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

it('uses native disclosures with non-interactive summaries and a sibling copy control', () => {
	const summaries = [...source.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)];
	expect(summaries.length).toBeGreaterThan(0);
	for (const [, summary] of summaries) {
		expect(summary).not.toMatch(/<a\b|<button\b|role="button"|<CopyButton\b/);
	}
	expect(source).toMatch(/<details\b/);
	expect(source).toMatch(/<\/summary>\s*<[^>]*>\s*<CopyButton\b|<\/summary>\s*<CopyButton\b/);
	expect(source).toContain('what="link to this question"');
});

it('removes the old feed, widgets and color classes', () => {
	for (const removed of [
		'Accordion',
		'Drawer',
		'lastFivePosts',
		'medium',
		'Latest from',
		'bg-purple-',
		'text-purple-',
		'bg-gray-',
		'dark:bg-gray-',
		'from-purple-',
		'bg-green-',
		'flowbite',
		'formatDate',
		'formatDistanceToNow',
		'showToast'
	])
		expect(source).not.toContain(removed);
});

it('provides navigation, persistent filter labels, recovery and a live result count', () => {
	for (const required of [
		'/how_to_node',
		'Clear filters',
		'Question not found',
		'aria-live="polite"',
		'container-page',
		'text-display',
		'Recently added'
	]) {
		expect(source).toContain(required);
	}
	expect(source).toMatch(/<label\b[^>]*for="faq-category"[^>]*>\s*Category\s*<\/label>/);
	expect(source).toMatch(/<select\b[^>]*id="faq-category"/);
	expect(source).toMatch(/<label\b[^>]*for="faq-search"[^>]*>\s*Search questions\s*<\/label>/);
	expect(source).toMatch(/<input\b[^>]*id="faq-search"[^>]*type="search"/);
	expect(navCurrent('/faq')).toBe('node');
});

it('renders each answer and its legacy id through a single details template', () => {
	expect([...source.matchAll(/<details\b/g)]).toHaveLength(1);
	expect([...source.matchAll(/\bid=\{/g)]).toHaveLength(1);
	expect(source).toMatch(/<details\b[^>]*id=\{slugify\(item.question\)\}/);
	expect([...source.matchAll(/<Markdown\b[^>]*source=\{[^}]*answer\}/g)]).toHaveLength(1);
	expect(source).not.toMatch(/\{#if\s+highlightedFAQ|highlightedFAQ\.answer/);
});

it('wires hydrated and later hash arrivals to the pure resolver, scroll and summary focus', () => {
	for (const required of [
		'onMount(',
		"'hashchange'",
		'location.hash',
		'visibleAfterResolve(',
		'scrollIntoView(',
		'.focus(',
		'ontoggle=',
		'openIds',
		"split('**')"
	])
		expect(source).toContain(required);
	expect(source).not.toContain('on:click');
	expect(source).toContain('$props()');
});
