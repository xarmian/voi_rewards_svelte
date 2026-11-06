import { describe, expect, it } from 'vitest';
import { faqData, type FAQItem } from '$lib/faqData';
import { copyUrl, filterGroups, resolveHash, slugify, visibleAfterResolve } from './faqView';

const flatten = (groups: Record<string, FAQItem[]>) => Object.values(groups).flat();
const examples: FAQItem[] = [
	{ question: 'Running a Node?', answer: 'Use a FAST machine.', category: 'Nodes', sort: 1 },
	{
		question: 'Wallet setup?',
		answer: 'Keep your recovery phrase safe.',
		category: 'Wallets',
		sort: 2
	},
	{ question: 'Node costs?', answer: 'Check hosting prices.', category: 'Nodes', sort: 3 }
];

describe('legacy slugs and hash resolution', () => {
	it.each([
		[
			'Can **Locked** or Non-vested Voi tokens earn block rewards?',
			'can-locked-or-non-vested-voi-tokens-earn-block-rewards-'
		],
		['How do I create a Voi Account?', 'how-do-i-create-a-voi-account-'],
		['How can I obtain **VOI** tokens?', 'how-can-i-obtain-voi-tokens-'],
		['How do I get started running a node?', 'how-do-i-get-started-running-a-node-'],
		[
			"I'm a developer. How can I build on Voi Network?",
			'i-m-a-developer-how-can-i-build-on-voi-network-'
		]
	])('preserves the hand-computed legacy slug for %s', (question, expected) => {
		expect(faqData.some((item) => item.question === question)).toBe(true);
		expect(slugify(question)).toBe(expected);
		expect(expected.endsWith('-')).toBe(true);
		expect(resolveHash(faqData, `#${expected}`)?.question).toBe(question);
	});

	it('resolves every real legacy hash to exactly its original question without collisions', () => {
		const slugs = faqData.map((item) => slugify(item.question));
		expect(new Set(slugs).size).toBe(faqData.length);
		for (const item of faqData) {
			const slug = slugify(item.question);
			expect(faqData.filter((candidate) => slugify(candidate.question) === slug)).toEqual([item]);
			expect(resolveHash(faqData, `#${slug}`)).toBe(item);
		}
	});

	it('decodes a percent-encoded legitimate slug before resolving', () => {
		const item = faqData[0];
		const encoded = [...slugify(item.question)]
			.map((c) => `%${c.charCodeAt(0).toString(16)}`)
			.join('');
		expect(resolveHash(faqData, `#${encoded}`)).toBe(item);
	});

	it.each(['#no-such-question', '', '#', '#%broken'])('returns null for %s', (hash) => {
		expect(resolveHash(faqData, hash)).toBeNull();
	});
});

describe('filterGroups', () => {
	it('preserves all existing questions and their categories when filters are clear', () => {
		const groups = filterGroups(faqData, 'All', '');
		const items = flatten(groups);
		expect(items).toHaveLength(faqData.length);
		expect(new Set(items.map((item) => item.question))).toEqual(
			new Set(faqData.map((item) => item.question))
		);
		expect(Object.keys(groups)).toEqual([...new Set(faqData.map((item) => item.category))]);
		for (const [category, group] of Object.entries(groups)) {
			expect(group).toEqual(faqData.filter((item) => item.category === category));
		}
	});

	it('selects a category while preserving order', () => {
		expect(flatten(filterGroups(examples, 'Nodes', ''))).toEqual([examples[0], examples[2]]);
	});

	it('matches question text case-insensitively', () => {
		expect(flatten(filterGroups(examples, 'All', 'RUNNING'))).toEqual([examples[0]]);
	});

	it('matches answer text case-insensitively and combines with the category', () => {
		expect(flatten(filterGroups(examples, 'Nodes', 'fast'))).toEqual([examples[0]]);
		expect(filterGroups(examples, 'Wallets', 'FAST')).toEqual({});
	});

	it('returns no groups for no match and restores the full list on clearing', () => {
		expect(filterGroups(faqData, 'All', 'no-such-faq-xyz')).toEqual({});
		expect(flatten(filterGroups(faqData, 'All', ''))).toHaveLength(faqData.length);
	});
});

describe('visibleAfterResolve', () => {
	it.each([
		{ category: 'Wallets', query: '' },
		{ category: 'All', query: 'recovery' },
		{ category: 'Wallets', query: 'recovery' }
	])('clears filters that hide the target: %j', (filters) => {
		expect(visibleAfterResolve(examples, '#running-a-node-', filters)).toEqual({
			faq: examples[0],
			category: 'All',
			query: ''
		});
	});

	it('keeps filters that already show the target', () => {
		expect(
			visibleAfterResolve(examples, '#running-a-node-', { category: 'Nodes', query: 'FAST' })
		).toEqual({
			faq: examples[0],
			category: 'Nodes',
			query: 'FAST'
		});
	});

	it('clears filters for an unknown hash so the full category list remains available', () => {
		expect(
			visibleAfterResolve(examples, '#missing', { category: 'Wallets', query: 'hidden' })
		).toEqual({
			faq: null,
			category: 'All',
			query: ''
		});
	});
});

it('copies the full URL with the legacy slug', () => {
	for (const { question } of faqData) {
		expect(copyUrl('https://example.test', '/faq', question)).toBe(
			`https://example.test/faq#${slugify(question)}`
		);
	}
});
