import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { XMLParser } from 'fast-xml-parser';

export const GET: RequestHandler = async ({ fetch }) => {
  try {
    const response = await fetch('https://medium.com/feed/@voifoundation');
    const xmlData = await response.text();
    
    const parser = new XMLParser();
    const result = parser.parse(xmlData);
    
    const posts = result.rss.channel.item.slice(0, 5).map((item: { title: string; link: string; pubDate: string; }) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate
    }));

    return json(posts);
  } catch (error) {
    console.error('Error fetching Medium posts:', error);
    return json([]);
  }
};
