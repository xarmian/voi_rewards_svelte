import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { UPSTREAM_TIMEOUT_MS, withDeadline } from '$lib/server/fetchWithTimeout';

export const GET: RequestHandler = async ({ fetch }) => {
	try {
		// TASK-92: one deadline over the fetch and the body read.
		const data = await withDeadline(async (signal) => {
			const response = await fetch(
				'https://raw.githubusercontent.com/fury-05/voiweeklyreports/main/data/reports.json',
				{ signal }
			);
			return response.json();
		}, UPSTREAM_TIMEOUT_MS);
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
