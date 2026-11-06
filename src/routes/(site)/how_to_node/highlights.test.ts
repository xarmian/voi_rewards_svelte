import { describe, expect, test } from 'vitest';
import type { FAQItem } from '$lib/faqData';
import { FAQ_HIGHLIGHTS } from './guides';
import { faqHighlights, faqSlug } from './highlights';

const questions = [
	'Can **Locked** or Non-vested Voi tokens earn block rewards?',
	'How do I get started running a node?'
] as const;
const item = (question: string, answer: string): FAQItem => ({
	question,
	answer,
	category: 'Node Operation',
	sort: 4
});

describe('FAQ highlights', () => {
	test('matches generated question values in requested order and omits missing questions', () => {
		const fixture = [item(questions[1], 'Setup answer.'), item(questions[0], 'Locked answer.')];
		expect(FAQ_HIGHLIGHTS).toEqual(questions);
		expect(faqHighlights(fixture, [...FAQ_HIGHLIGHTS, 'Missing question'])).toEqual([
			{ question: questions[0], slug: faqSlug(questions[0]), excerpt: 'Locked answer.' },
			{ question: questions[1], slug: faqSlug(questions[1]), excerpt: 'Setup answer.' }
		]);
	});

	test('preserves punctuation hyphens to match FAQ hashes', () => {
		expect(faqSlug(questions[1])).toBe('how-do-i-get-started-running-a-node-');
		expect(faqSlug(questions[0])).toBe('can-locked-or-non-vested-voi-tokens-earn-block-rewards-');
	});

	test('strips markdown and keeps only the first paragraph', () => {
		const answer =
			'### **Start** with [this guide](https://example.com)\n- Use `Linux`\n1. _Sync_ the node.\n\nDo not include this paragraph.';
		expect(faqHighlights([item('Setup', answer)], ['Setup'])[0].excerpt).toBe(
			'Start with this guide Use Linux Sync the node.'
		);
	});

	test('limits excerpts to 240 characters including the ellipsis', () => {
		const excerpt = faqHighlights([item('Long', 'word '.repeat(80))], ['Long'])[0].excerpt;
		expect(excerpt.length).toBeLessThanOrEqual(240);
		expect(excerpt).toBe('word '.repeat(80).slice(0, 239).trimEnd() + '…');
		expect(faqHighlights([item('Exact', 'x'.repeat(240))], ['Exact'])[0].excerpt).toBe(
			'x'.repeat(240)
		);
	});

	test('never produces an empty excerpt for a non-empty answer', () => {
		for (const answer of ['\n\n**Answer**', '---\n\nUseful text.', '**', '   ']) {
			expect(
				faqHighlights([item('Question', answer)], ['Question'])[0].excerpt.length
			).toBeGreaterThan(0);
		}
	});
});
