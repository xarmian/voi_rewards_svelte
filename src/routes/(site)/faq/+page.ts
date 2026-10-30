import { browser } from '$app/environment';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url, fetch, data }) => {
	const { faqData } = data;
	const hash = url.href.split('#')[1];
	let highlightedFAQ = null;
	let pageMetaTags = {
		title: 'Frequently Asked Questions | Voi Network',
		description: 'Find answers to common questions about Voi Network',
		imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png'
	};

	if (hash) {
		highlightedFAQ = faqData.find((item) => slugify(item.question) === hash);
		if (highlightedFAQ) {
			pageMetaTags = {
				title: `FAQ: ${highlightedFAQ.question} | Voi Network`,
				description: truncate(highlightedFAQ.answer, 160),
				imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png'
			};
		}
	}

	// Universal load reruns during hydration; only start this optional request in the browser.
	const lastFivePosts = browser
		? (async () => {
				try {
					const response = await fetch('/api/medium-posts');
					if (!response.ok) return [];
					const posts = await response.json();
					return Array.isArray(posts) ? posts : [];
				} catch {
					return [];
				}
			})()
		: Promise.resolve([]);

	const recentFAQs = faqData.filter((item) => item.recent === 'true').slice(0, 3);

	return {
		highlightedFAQ,
		pageMetaTags,
		faqData,
		lastFivePosts,
		recentFAQs
	};
};

function slugify(text: string) {
	return text.toLowerCase().replace(/[^\w]+/g, '-');
}

function truncate(text: string, length: number) {
	return text.length > length ? text.substring(0, length - 3) + '...' : text;
}
