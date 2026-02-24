import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';
import type { PoolCatalog, TokenPair } from '$lib/types/ohlcv.types';

// Create MIMIR client for OHLCV data
const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

export const GET: RequestHandler = async ({ url }) => {
	try {
		const query = url.searchParams.get('q') || '';
		const popular = url.searchParams.get('popular') === 'true';
		const tokenId = url.searchParams.get('tokenId');
		const tokenSymbol = url.searchParams.get('tokenSymbol');
		const limit = parseInt(url.searchParams.get('limit') || '50');

		if (isNaN(limit) || limit < 1 || limit > 200) {
			return json({ error: 'limit must be a number between 1 and 200' }, { status: 400 });
		}

		// Fetch token pairs from MIMIR pool_catalog
		let poolQuery = supabaseMimirClient.from('pool_catalog').select('*').limit(limit);

		// If tokenId or tokenSymbol is provided, get all pools containing that token
		if (tokenId) {
			poolQuery = poolQuery.or(`token_a_id.eq.${tokenId},token_b_id.eq.${tokenId}`);
		} else if (tokenSymbol) {
			// Special handling for VOI: include both VOI and wVOI pools
			if (tokenSymbol.toUpperCase() === 'VOI') {
				poolQuery = poolQuery.or(
					`token_a_symbol.ilike.VOI,token_b_symbol.ilike.VOI,token_a_symbol.ilike.wVOI,token_b_symbol.ilike.wVOI`
				);
			} else {
				poolQuery = poolQuery.or(
					`token_a_symbol.ilike.${tokenSymbol},token_b_symbol.ilike.${tokenSymbol}`
				);
			}
		} else if (query) {
			// Search by symbol
			poolQuery = poolQuery.or(`token_a_symbol.ilike.%${query}%,token_b_symbol.ilike.%${query}%`);
		}

		if (popular) {
			// For popular, just order by pool_id for now (could be enhanced with volume data)
			poolQuery = poolQuery.order('pool_id', { ascending: true });
		} else {
			poolQuery = poolQuery.order('token_a_symbol', { ascending: true });
		}

		const { data, error } = await poolQuery;

		if (error) {
			return json({ error: `Failed to fetch token pairs: ${error.message}` }, { status: 500 });
		}

		// Convert to TokenPair format, normalizing wVOI to VOI for display
		const tokenPairs: TokenPair[] = (data as PoolCatalog[]).map((pool) => {
			const normalizeSymbol = (symbol: string) =>
				symbol.toUpperCase() === 'WVOI' ? 'VOI' : symbol;

			return {
				baseTokenId: pool.token_b_id,
				quoteTokenId: pool.token_a_id,
				baseSymbol: normalizeSymbol(pool.token_b_symbol),
				quoteSymbol: normalizeSymbol(pool.token_a_symbol),
				baseDecimals: pool.token_b_decimals,
				quoteDecimals: pool.token_a_decimals,
				poolId: pool.pool_id
			};
		});

		// If searching for a specific token, normalize pairs to put that token as base
		let normalizedPairs = tokenPairs;
		if (tokenId || tokenSymbol) {
			const targetId = tokenId ? parseInt(tokenId) : null;
			const targetSymbol = tokenSymbol?.toUpperCase();

			normalizedPairs = tokenPairs.map((pair) => {
				const shouldSwap = targetId
					? pair.quoteTokenId === targetId
					: pair.quoteSymbol.toUpperCase() === targetSymbol;

				if (shouldSwap) {
					return {
						baseTokenId: pair.quoteTokenId,
						quoteTokenId: pair.baseTokenId,
						baseSymbol: pair.quoteSymbol,
						quoteSymbol: pair.baseSymbol,
						baseDecimals: pair.quoteDecimals,
						quoteDecimals: pair.baseDecimals,
						poolId: pair.poolId
					};
				}
				return pair;
			});

			// Sort with TOKEN/VOI pairs first
			normalizedPairs.sort((a, b) => {
				const aIsVOI =
					a.quoteSymbol.toUpperCase() === 'VOI' || a.quoteSymbol.toUpperCase() === 'WVOI';
				const bIsVOI =
					b.quoteSymbol.toUpperCase() === 'VOI' || b.quoteSymbol.toUpperCase() === 'WVOI';

				if (aIsVOI && !bIsVOI) return -1;
				if (!aIsVOI && bIsVOI) return 1;

				return a.quoteSymbol.localeCompare(b.quoteSymbol);
			});
		}

		// Group pairs by base token for better organization
		const groupedPairs = normalizedPairs.reduce(
			(acc, pair) => {
				if (!acc[pair.baseSymbol]) {
					acc[pair.baseSymbol] = [];
				}
				acc[pair.baseSymbol].push(pair);
				return acc;
			},
			{} as Record<string, typeof normalizedPairs>
		);

		// Get unique base and quote tokens for filters
		const baseTokens = [
			...new Set(
				normalizedPairs.map((p) => ({
					id: p.baseTokenId,
					symbol: p.baseSymbol,
					decimals: p.baseDecimals
				}))
			)
		];

		const quoteTokens = [
			...new Set(
				normalizedPairs.map((p) => ({
					id: p.quoteTokenId,
					symbol: p.quoteSymbol,
					decimals: p.quoteDecimals
				}))
			)
		];

		return json({
			pairs: normalizedPairs,
			groupedPairs,
			baseTokens,
			quoteTokens,
			total: normalizedPairs.length
		});
	} catch (error) {
		console.error('Token Pairs API Error:', error);

		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return json({ error: errorMessage }, { status: 500 });
	}
};

// Validate specific token pair
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { baseTokenId, quoteTokenId } = await request.json();

		if (typeof baseTokenId !== 'number' || typeof quoteTokenId !== 'number') {
			return json({ error: 'baseTokenId and quoteTokenId must be numbers' }, { status: 400 });
		}

		// Check if token pair exists in pool catalog
		const { data, error } = await supabaseMimirClient
			.from('pool_catalog')
			.select('*')
			.or(
				`and(token_a_id.eq.${baseTokenId},token_b_id.eq.${quoteTokenId}),and(token_a_id.eq.${quoteTokenId},token_b_id.eq.${baseTokenId})`
			)
			.limit(1);

		if (error) {
			return json({ error: `Database error: ${error.message}` }, { status: 500 });
		}

		if (!data || data.length === 0) {
			return json({ error: 'Token pair not found' }, { status: 404 });
		}

		const pool = data[0] as PoolCatalog;

		// Ensure we return the pair in the requested order (swapping to correct base/quote)
		const tokenPair: TokenPair =
			baseTokenId === pool.token_b_id
				? {
						baseTokenId: pool.token_b_id,
						quoteTokenId: pool.token_a_id,
						baseSymbol: pool.token_b_symbol,
						quoteSymbol: pool.token_a_symbol,
						baseDecimals: pool.token_b_decimals,
						quoteDecimals: pool.token_a_decimals,
						poolId: pool.pool_id
					}
				: {
						baseTokenId: pool.token_a_id,
						quoteTokenId: pool.token_b_id,
						baseSymbol: pool.token_a_symbol,
						quoteSymbol: pool.token_b_symbol,
						baseDecimals: pool.token_a_decimals,
						quoteDecimals: pool.token_b_decimals,
						poolId: pool.pool_id
					};

		return json({ tokenPair });
	} catch (error) {
		console.error('Token Pair Validation Error:', error);
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
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
};
