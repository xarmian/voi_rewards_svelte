import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./[...category]/+page.svelte', import.meta.url), 'utf8');
const card = readFileSync(
	new URL('../../../lib/components/ecosystem/ProjectCard.svelte', import.meta.url),
	'utf8'
);

it('directory removes imperative navigation, icon classes and old visual treatment', () => {
	for (const removed of [
		'goto',
		'updateURL',
		'replaceState',
		'fas ',
		'fab ',
		'violet-',
		'fuchsia-',
		'pink-',
		'bg-gray-',
		'dark:bg-gray-',
		'backdrop-blur',
		'bg-gradient',
		'categoryClick'
	]) {
		expect(source).not.toContain(removed);
	}
	expect(source).not.toMatch(/from-(?:violet|fuchsia|pink|gray|white|green|emerald|purple|blue)-?/);
});

it('directory has labelled search, anchor categories, honest states and a static Markets destination', () => {
	for (const required of [
		'<label',
		'type="search"',
		'aria-label="Categories"',
		'aria-live',
		'aria-busy',
		'/markets',
		'Clear filters',
		'Retry',
		'container-page',
		'text-display',
		'No projects are listed yet',
		'No matching projects',
		"Couldn't load the directory",
		'Loading projects',
		'Stale',
		'Retrieved',
		'content age unknown',
		'grid-cols-1',
		'md:grid-cols-2',
		'lg:grid-cols-3',
		'gap-bento'
	])
		expect(source).toContain(required);
	expect(source).toMatch(/<label\b[^>]*for="project-search"[^>]*>\s*Search projects\s*<\/label>/);
	expect(source).toMatch(/<input\b[^>]*id="project-search"[^>]*type="search"/);
	const categories = source.match(/<nav\b[^>]*aria-label="Categories"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
	expect(categories).toMatch(/<a\s[^>]*href=\{categoryHref\(category\)\}/);
	expect(categories).toContain('aria-current=');
	expect(categories).toContain('underline');
	expect(categories).toContain('min-h-11');
	expect(categories).not.toMatch(/<button|overflow-x/);
	expect(source).toMatch(/selectedCategory\s*=\s*\$derived\(data.category\)/);
	expect(source).toContain('$props()');
	expect(source).toContain('data-sveltekit-noscroll');
	expect(source).not.toMatch(/\.focus\(/);
	expect(source).not.toMatch(/import[\s\S]*?from\s*['"][^'"]*(?:\$lib\/markets|\/markets\/)/);
	expect(source).toMatch(/variant="nav"/);
	expect(source).toContain('onHero={false}');
});

it('card uses sibling links and plain text identity without a clickable root', () => {
	for (const removed of [
		'stretched-link',
		'createEventDispatcher',
		'categoryClick',
		'scale(',
		'blur-',
		'bg-clip-text',
		'fa-',
		'<button'
	])
		expect(card).not.toContain(removed);
	for (const required of [
		'rel="noopener noreferrer"',
		'opens in a new tab',
		'categoryHref',
		'$props()'
	]) {
		expect(card).toContain(required);
	}
	const anchors = [...card.matchAll(/<a\s|<\/a>/g)];
	let depth = 0;
	for (const [tag] of anchors) {
		depth += tag.startsWith('</') ? -1 : 1;
		expect(depth).toBeGreaterThanOrEqual(0);
		expect(depth).toBeLessThanOrEqual(1);
	}
	expect(depth).toBe(0);
	expect(card).not.toContain('onclick');
});
