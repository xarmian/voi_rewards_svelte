import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
	try {
		const response = await fetch(
			'https://raw.githubusercontent.com/fury-05/voiweeklyreports/main/data/reports.json'
		);
		const data = await response.json();
		return json(data, {
			headers: {
				'Cache-Control': 'public, max-age=300'
			}
		});
	} catch (error) {
		console.error('Error fetching weekly reports:', error);
		return json([]);
	}
};
