import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';
import type { PoolCatalog } from '$lib/types/ohlcv.types';

// Create MIMIR client for OHLCV data
const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

export interface UniqueToken {
	id: number;
	symbol: string;
	decimals: number;
	type: 'VOI' | 'ARC200' | 'ASA' | 'UNKNOWN';
	poolCount: number;
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const query = url.searchParams.get('q') || '';
		const limit = parseInt(url.searchParams.get('limit') || '100');

		if (isNaN(limit) || limit < 1 || limit > 500) {
			return json({ error: 'limit must be a number between 1 and 500' }, { status: 400 });
		}

		// Fetch all pool data to extract unique tokens
		let poolQuery = supabaseMimirClient.from('pool_catalog').select('*');

		if (query) {
			// Search by either token_a_symbol or token_b_symbol
			poolQuery = poolQuery.or(`token_a_symbol.ilike.%${query}%,token_b_symbol.ilike.%${query}%`);
		}

		const { data, error } = await poolQuery;

		if (error) {
			return json({ error: `Failed to fetch tokens: ${error.message}` }, { status: 500 });
		}

		// Extract unique tokens from both token_a and token_b, normalizing wVOI to VOI
		const tokenMap = new Map<string, UniqueToken>(); // Use symbol as key for normalization

		function normalizeToken(
			id: number,
			symbol: string,
			decimals: number,
			type: string
		): UniqueToken {
			const normalizedSymbol = symbol.toUpperCase() === 'WVOI' ? 'VOI' : symbol;
			const normalizedType =
				symbol.toUpperCase() === 'WVOI' || symbol.toUpperCase() === 'VOI' ? 'VOI' : type;

			return {
				id: id,
				symbol: normalizedSymbol,
				decimals: decimals,
				type: normalizedType as 'VOI' | 'ARC200' | 'ASA' | 'UNKNOWN',
				poolCount: 0
			};
		}

		(data as PoolCatalog[]).forEach((pool) => {
			// Add token_a (normalized)
			const tokenA = normalizeToken(
				pool.token_a_id,
				pool.token_a_symbol,
				pool.token_a_decimals,
				pool.token_a_type
			);
			if (!tokenMap.has(tokenA.symbol)) {
				tokenMap.set(tokenA.symbol, tokenA);
			}
			tokenMap.get(tokenA.symbol)!.poolCount++;

			// Add token_b (normalized)
			const tokenB = normalizeToken(
				pool.token_b_id,
				pool.token_b_symbol,
				pool.token_b_decimals,
				pool.token_b_type
			);
			if (!tokenMap.has(tokenB.symbol)) {
				tokenMap.set(tokenB.symbol, tokenB);
			}
			tokenMap.get(tokenB.symbol)!.poolCount++;
		});

		// Convert to array and filter by query if provided
		let tokens = Array.from(tokenMap.values());

		if (query) {
			tokens = tokens.filter((token) => token.symbol.toLowerCase().includes(query.toLowerCase()));
		}

		// Sort by pool count (most liquid first) then by symbol
		tokens.sort((a, b) => {
			if (a.poolCount !== b.poolCount) {
				return b.poolCount - a.poolCount;
			}
			return a.symbol.localeCompare(b.symbol);
		});

		// Apply limit
		tokens = tokens.slice(0, limit);

		return json({
			tokens,
			total: tokens.length
		});
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
