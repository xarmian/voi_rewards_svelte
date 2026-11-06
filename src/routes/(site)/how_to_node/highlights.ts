import type { FAQItem } from '$lib/faqData';

// Match the FAQ route's hash algorithm, including trailing punctuation hyphens.
export function faqSlug(text: string): string {
	return text.toLowerCase().replace(/[^\w]+/g, '-');
}

export function faqHighlights(
	items: FAQItem[],
	questions: readonly string[]
): { question: string; slug: string; excerpt: string }[] {
	return questions.flatMap((question) => {
		const item = items.find((item) => item.question === question);
		if (!item) return [];

		const paragraphs = item.answer.trim().split(/\r?\n\s*\r?\n/);
		const text =
			paragraphs
				.map((paragraph) =>
					paragraph
						.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
						.replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)/gm, '')
						.replace(/<[^>]*>/g, '')
						.replace(/[*_`~]/g, '')
						.replace(/^\s*-{3,}\s*$/gm, '')
						.replace(/\s+/g, ' ')
						.trim()
				)
				.find(Boolean) ?? (item.answer ? '…' : '');
		const excerpt = text.length > 240 ? text.slice(0, 239).trimEnd() + '…' : text;
		return [{ question: item.question, slug: faqSlug(item.question), excerpt }];
	});
}
