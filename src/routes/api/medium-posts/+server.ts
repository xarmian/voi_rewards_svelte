import { withDeadline } from '$lib/server/fetchWithTimeout';
import { CACHE_TTL, publicCache } from '$lib/server/httpCache';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { XMLParser } from 'fast-xml-parser';

export const GET: RequestHandler = async ({ fetch }) => {
	try {
		const xmlData = await withDeadline(async (signal) => {
			const response = await fetch('https://medium.com/feed/@voifoundation', { signal });
			if (!response.ok) throw new Error(`Medium API error: ${response.status}`);
			return response.text();
		}, 3000);

		const parser = new XMLParser();
		const result = parser.parse(xmlData);

		const posts = result.rss.channel.item
			.slice(0, 5)
			.map((item: { title: string; link: string; pubDate: string }) => ({
				title: item.title,
				link: item.link,
				pubDate: item.pubDate
			}));

		return json(posts, {
			headers: publicCache(
				CACHE_TTL['medium-posts'].sMaxAge,
				CACHE_TTL['medium-posts'].staleWhileRevalidate
			)
		});
	} catch (error) {
		console.error('Error fetching Medium posts:', error);
		return json([]);
	}
};
