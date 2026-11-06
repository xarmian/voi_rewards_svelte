import type { FAQItem } from '$lib/faqData';

export function slugify(text: string): string {
	// Existing shared links include trailing hyphens and collapsed punctuation runs.
	return text.toLowerCase().replace(/[^\w]+/g, '-');
}

export function resolveHash(items: FAQItem[], hash: string): FAQItem | null {
	let slug: string;
	try {
		slug = decodeURIComponent(hash.replace(/^#/, ''));
	} catch {
		return null;
	}
	if (!slug) return null;
	return items.find((item) => slugify(item.question) === slug) ?? null;
}

export function filterGroups(
	items: FAQItem[],
	category: string,
	query: string
): Record<string, FAQItem[]> {
	const groups: Record<string, FAQItem[]> = {};
	const search = query.toLowerCase();
	for (const item of items) {
		if (category !== 'All' && item.category !== category) continue;
		if (
			!item.question.toLowerCase().includes(search) &&
			!item.answer.toLowerCase().includes(search)
		)
			continue;
		(groups[item.category] ??= []).push(item);
	}
	return groups;
}

export function visibleAfterResolve(
	items: FAQItem[],
	hash: string,
	filters: { category: string; query: string }
): { faq: FAQItem | null; category: string; query: string } {
	const faq = resolveHash(items, hash);
	const visible =
		faq && filterGroups(items, filters.category, filters.query)[faq.category]?.includes(faq);
	if (hash && !visible) return { faq, category: 'All', query: '' };
	return { faq, ...filters };
}

export function copyUrl(origin: string, pathname: string, question: string): string {
	return `${origin}${pathname}#${slugify(question)}`;
}
