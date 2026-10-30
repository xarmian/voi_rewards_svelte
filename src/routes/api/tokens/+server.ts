import { UPSTREAM_TIMEOUT_MS } from '$lib/server/fetchWithTimeout';
import { CACHE_TTL, publicCache } from '$lib/server/httpCache';
import { json, type RequestHandler } from '@sveltejs/kit';
import { pgrstQuote, validateTokenSearch } from '$lib/server/validate';
import { mimirClient as supabaseMimirClient } from '$lib/mimir';
import { uniqueTokens } from '$lib/server/tokens';
import type { PoolCatalog } from '$lib/types/ohlcv.types';

export type { UniqueToken } from '$lib/server/tokens';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const validationError = validateTokenSearch(url.searchParams.get('q'), 'q');
		if (validationError) return json({ error: validationError }, { status: 400 });
		const query = url.searchParams.get('q') || '';
		const limit = parseInt(url.searchParams.get('limit') || '100');

		if (isNaN(limit) || limit < 1 || limit > 500) {
			return json({ error: 'limit must be a number between 1 and 500' }, { status: 400 });
		}

		// Fetch all pool data to extract unique tokens
		let poolQuery = supabaseMimirClient
			.from('pool_catalog')
			.select('*')
			.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS));

		if (query) {
			// Search by either token_a_symbol or token_b_symbol
			const escapedQuery = query.replace(/[\\%_]/g, '\\$&');
			poolQuery = poolQuery.or(
				`token_a_symbol.ilike.${pgrstQuote(`%${escapedQuery}%`)},token_b_symbol.ilike.${pgrstQuote(`%${escapedQuery}%`)}`
			);
		}

		const { data, error } = await poolQuery;

		if (error) {
			return json({ error: `Failed to fetch tokens: ${error.message}` }, { status: 500 });
		}

		const tokens = uniqueTokens(data as PoolCatalog[], query).slice(0, limit);

		return json(
			{
				tokens,
				total: tokens.length
			},
			{ headers: publicCache(CACHE_TTL.tokens.sMaxAge, CACHE_TTL.tokens.staleWhileRevalidate) }
		);
	} catch (error) {
		console.error('Tokens API Error:', error);

		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return json({ error: errorMessage }, { status: 500 });
	}
};

// Optional: Add CORS headers for development
export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
};
