import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// jsdom has no layout, so the phone layout of the recipients toolbar popovers is pinned at the
// class level: below `sm` each popover spans the toolbar row; from `sm` up it hangs off its button.
const source = readFileSync(new URL('./SendTokenModal.svelte', import.meta.url), 'utf8');

function classTokens(tag: string): string[] {
	const match = tag.match(/class="([^"]*)"/);
	return match ? match[1].split(/\s+/).filter(Boolean) : [];
}

function popoverParts(label: string) {
	const labelAt = source.indexOf(`\n${'\t'.repeat(9)}${label}\n`);
	expect(labelAt, `toolbar button labelled ${label}`).toBeGreaterThan(-1);
	const before = source.slice(0, labelAt);
	const wrapperAt = before.lastIndexOf('<div');
	const wrapperTag = before.slice(
		wrapperAt,
		before.indexOf('>', before.indexOf('class=', wrapperAt))
	);
	const after = source.slice(labelAt);
	const popoverAt = after.search(/<div\s+class="absolute\b/);
	expect(popoverAt, `popover opened by ${label}`).toBeGreaterThan(-1);
	const popoverTag = after.slice(popoverAt, after.indexOf('>', popoverAt));
	return { wrapper: classTokens(wrapperTag), popover: classTokens(popoverTag) };
}

describe('SendTokenModal recipients toolbar popovers', () => {
	test.each([
		['Combine', 'w-48'],
		['Set All', 'w-64'],
		['Set Notes', 'w-64']
	])('%s popover spans the toolbar on phones and hangs off its button from sm', (label, width) => {
		const { wrapper, popover } = popoverParts(label);
		expect(wrapper, 'wrapper is static on phones').not.toContain('relative');
		expect(wrapper, 'wrapper anchors the popover from sm').toContain('sm:relative');
		expect(popover).toEqual(
			expect.arrayContaining(['absolute', 'left-0', 'right-0', 'sm:left-auto'])
		);
		expect(popover, 'no fixed width on phones').not.toContain(width);
		expect(popover, 'fixed width from sm').toContain(`sm:${width}`);
		expect(
			popover.filter((c) => /^w-/.test(c)),
			'no unprefixed width'
		).toEqual([]);
	});

	test('the toolbar row anchors the phone popovers', () => {
		const combineAt = source.indexOf(`\n${'\t'.repeat(9)}Combine\n`);
		const before = source.slice(0, combineAt);
		const rowTags = [...before.matchAll(/<div class="([^"]*\bflex-wrap\b[^"]*)">/g)];
		const row = rowTags[rowTags.length - 1];
		expect(row, 'toolbar row container').toBeDefined();
		expect(row[1].split(/\s+/)).toEqual(expect.arrayContaining(['relative', 'flex', 'flex-wrap']));
	});
});
