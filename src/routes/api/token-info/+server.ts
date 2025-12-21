import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';

// MIMIR client (public anon)
const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

interface TokenInfo {
	tokenId: number;
	symbol: string;
	decimals: number;
	imageUrl: string | null;
	type: 'VOI' | 'ARC200' | 'ASA' | 'UNKNOWN';
	equivalents: number[];
	totalSupply: number | null;
	algoAssetId: number | null;
}

// Get token equivalents from arc200_contracts table
async function getTokenEquivalents(tokenId: number): Promise<number[]> {
	try {
		const { data, error } = await supabaseMimirClient
			.from('arc200_contracts')
			.select('contract_id, token_id')
			.or(`contract_id.eq.${tokenId},token_id.eq.${tokenId}`);

		if (error || !data || data.length === 0) {
			return [];
		}

		const equivalents: number[] = [];
		data.forEach((row) => {
			// Add the contract_id (ARC200 token) if different from input
			if (row.contract_id !== tokenId) {
				equivalents.push(row.contract_id);
			}

			// Add the token_id (ASA/native token) if it exists and contains no comma
			if (row.token_id && typeof row.token_id === 'string' && !row.token_id.includes(',')) {
				const equivalentId = parseInt(row.token_id, 10);
				if (!isNaN(equivalentId) && equivalentId !== tokenId) {
					equivalents.push(equivalentId);
				}
			}
		});

		return equivalents;
	} catch (error) {
		console.error('Failed to get token equivalents:', error);
		return [];
	}
}

// Get token total supply
async function getTokenTotalSupply(tokenId: number): Promise<number | null> {
	try {
		// Handle VOI (token ID 0)
		if (tokenId === 0) {
			return 10_000_000_000; // 10B VOI total supply
		}

		// Try ARC200 contracts first
		const { data: arc200Data, error: arc200Error } = await supabaseMimirClient
			.from('arc200_contracts')
			.select('total_supply')
			.eq('contract_id', tokenId)
			.single();

		if (!arc200Error && arc200Data && arc200Data.total_supply) {
			return parseInt(arc200Data.total_supply, 10);
		}

		// Fallback to assets table for ASA
		const { data: assetData, error: assetError } = await supabaseMimirClient
			.from('asset')
			.select('params')
			.eq('index', tokenId)
			.single();

		if (!assetError && assetData && assetData.params) {
			const params = assetData.params as any;
			return params.t || null; // total supply
		}

		return null;
	} catch (error) {
		console.error('Failed to get token total supply:', error);
		return null;
	}
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const tokenId = url.searchParams.get('tokenId');
		const symbol = url.searchParams.get('symbol');

		if (!tokenId && !symbol) {
			return json({ error: 'tokenId or symbol is required' }, { status: 400 });
		}

		let targetTokenId: number;
		let tokenInfo: TokenInfo;

		if (tokenId) {
			targetTokenId = Number(tokenId);

			// Handle VOI (token ID 0) specially
			if (targetTokenId === 0) {
				const [equivalents, totalSupply] = await Promise.all([
					getTokenEquivalents(0),
					getTokenTotalSupply(0)
				]);

				tokenInfo = {
					tokenId: 0,
					symbol: 'VOI',
					decimals: 6,
					imageUrl: null,
					type: 'VOI',
					equivalents,
					totalSupply
				};
			} else {
				// Try ARC200 contracts first
				const { data: arc200Data, error: arc200Error } = await supabaseMimirClient
					.from('arc200_contracts')
					.select('contract_id, symbol, decimals, image_url, algo_asset_id')
					.eq('contract_id', targetTokenId)
					.single();

				if (!arc200Error && arc200Data) {
					const [equivalents, totalSupply] = await Promise.all([
						getTokenEquivalents(targetTokenId),
						getTokenTotalSupply(targetTokenId)
					]);

					tokenInfo = {
						tokenId: arc200Data.contract_id,
						symbol: arc200Data.symbol || 'UNKNOWN',
						decimals: arc200Data.decimals || 0,
						imageUrl: arc200Data.image_url || null,
						algoAssetId: arc200Data.algo_asset_id || null,
						type: 'ARC200',
						equivalents,
						totalSupply
					};
				} else {
					// Fallback to assets table for ASA
					const { data: assetData, error: assetError } = await supabaseMimirClient
						.from('asset')
						.select('params')
						.eq('index', targetTokenId)
						.single();

					if (!assetError && assetData && assetData.params) {
						const params = assetData.params as any;
						const [equivalents, totalSupply] = await Promise.all([
							getTokenEquivalents(targetTokenId),
							getTokenTotalSupply(targetTokenId)
						]);

						tokenInfo = {
							tokenId: targetTokenId,
							symbol: params.un || 'UNKNOWN',
							decimals: params.dc || 0,
							imageUrl: null,
							type: 'ASA',
							equivalents,
							totalSupply
						};
					} else {
						return json({ info: null });
					}
				}
			}
		} else if (symbol) {
			// Handle VOI symbol specially
			if (symbol.toUpperCase() === 'VOI') {
				const [equivalents, totalSupply] = await Promise.all([
					getTokenEquivalents(0),
					getTokenTotalSupply(0)
				]);

				tokenInfo = {
					tokenId: 0,
					symbol: 'VOI',
					decimals: 6,
					imageUrl: null,
					type: 'VOI',
					equivalents,
					totalSupply
				};
			} else {
				// Case-insensitive match on symbol in ARC200 contracts
				const { data, error } = await supabaseMimirClient
					.from('arc200_contracts')
					.select('contract_id, symbol, decimals, image_url')
					.ilike('symbol', symbol)
					.limit(1);

				if (error || !data || data.length === 0) {
					return json({ info: null });
				}

				const row = data[0];
				const [equivalents, totalSupply] = await Promise.all([
					getTokenEquivalents(row.contract_id),
					getTokenTotalSupply(row.contract_id)
				]);

				tokenInfo = {
					tokenId: row.contract_id,
					symbol: row.symbol || 'UNKNOWN',
					decimals: row.decimals || 0,
					imageUrl: row.image_url || null,
					type: 'ARC200',
					equivalents,
					totalSupply
				};
			}
		} else {
			return json({ info: null });
		}

		return json({
			info: tokenInfo
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};

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
