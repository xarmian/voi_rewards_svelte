import { resolveHash } from './faqView';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url, data }) => {
	const { faqData } = data;
	const hash = url.href.split('#')[1];
	const highlightedFAQ = resolveHash(faqData, hash ?? '');
	let pageMetaTags = {
		title: 'Frequently Asked Questions | Voi Network',
		description: 'Find answers to common questions about Voi Network',
		imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png'
	};

	if (highlightedFAQ) {
		pageMetaTags = {
			title: `FAQ: ${highlightedFAQ.question} | Voi Network`,
			description: truncate(highlightedFAQ.answer, 160),
			imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png'
		};
	}

	const recentFAQs = faqData.filter((item) => item.recent === 'true').slice(0, 3);

	return {
		highlightedFAQ,
		pageMetaTags,
		faqData,
		recentFAQs
	};
};

function truncate(text: string, length: number) {
	return text.length > length ? text.substring(0, length - 3) + '...' : text;
}
