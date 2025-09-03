import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';

// Create MIMIR client for token data
const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

export interface TokenSupply {
	tokenId: number;
	symbol: string;
	totalSupply: number;
	decimals: number;
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const tokenIds =
			url.searchParams
				.get('tokenIds')
				?.split(',')
				.map((id) => parseInt(id)) || [];

		if (tokenIds.length === 0) {
			return json({ error: 'tokenIds parameter is required' }, { status: 400 });
		}

		// Query the arc200_contracts table directly
		const { data, error } = await supabaseMimirClient
			.from('arc200_contracts')
			.select('contract_id, symbol, decimals, total_supply')
			.in('contract_id', tokenIds);

		if (error) {
			return json(
				{ error: `Failed to fetch token supply data: ${error.message}` },
				{ status: 500 }
			);
		}

		if (!data || data.length === 0) {
			return json(
				{ error: 'No token supply data found for the requested token IDs' },
				{ status: 404 }
			);
		}

		// Transform the response to our format
		const tokenSupplies: TokenSupply[] = data
			.map((token) => ({
				tokenId: token.contract_id,
				symbol: token.symbol,
				totalSupply: token.total_supply
					? parseFloat(token.total_supply) / Math.pow(10, token.decimals)
					: 0,
				decimals: token.decimals
			}))
			.filter((token) => token.tokenId && token.totalSupply > 0);

		console.log('Requested token IDs:', tokenIds);
		console.log('Found matching tokens:', tokenSupplies);

		return json({
			supplies: tokenSupplies,
			total: tokenSupplies.length
		});
	} catch (error) {
		console.error('Token Supply API Error:', error);

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
