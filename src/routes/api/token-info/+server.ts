import { UPSTREAM_TIMEOUT_MS } from '$lib/server/fetchWithTimeout';
import { CACHE_TTL, publicCache } from '$lib/server/httpCache';
import { json, type RequestHandler } from '@sveltejs/kit';
import { mimirClient as supabaseMimirClient } from '$lib/mimir';
import { getTokenEquivalents } from '$lib/tokens/equivalents';

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

// Get token total supply
async function getTokenTotalSupply(
	tokenId: number
): Promise<{ value: number | null; failed: boolean }> {
	try {
		// Handle VOI (token ID 0)
		if (tokenId === 0) {
			return { value: 10_000_000_000, failed: false }; // 10B VOI total supply
		}

		// Try ARC200 contracts first
		const { data: arc200Data, error: arc200Error } = await supabaseMimirClient
			.from('arc200_contracts')
			.select('total_supply')
			.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
			.eq('contract_id', tokenId)
			.single();

		if (!arc200Error && arc200Data && arc200Data.total_supply) {
			return { value: parseInt(arc200Data.total_supply, 10), failed: false };
		}

		const arc200Failed = !!arc200Error && arc200Error.code !== 'PGRST116';

		// Fallback to assets table for ASA
		const { data: assetData, error: assetError } = await supabaseMimirClient
			.from('asset')
			.select('params')
			.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
			.eq('index', tokenId)
			.single();

		if (!assetError && assetData && assetData.params) {
			const params = assetData.params as any;
			return { value: params.t || null, failed: arc200Failed }; // total supply
		}

		return {
			value: null,
			failed: arc200Failed || (!!assetError && assetError.code !== 'PGRST116')
		};
	} catch (error) {
		console.error('Failed to get token total supply:', error);
		return { value: null, failed: true };
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
		let degraded = false;

		if (tokenId) {
			targetTokenId = Number(tokenId);

			// Handle VOI (token ID 0) specially
			if (targetTokenId === 0) {
				const [equivalents, totalSupply] = await Promise.all([
					getTokenEquivalents(0),
					getTokenTotalSupply(0)
				]);
				degraded ||= equivalents.failed || totalSupply.failed;

				tokenInfo = {
					tokenId: 0,
					symbol: 'VOI',
					decimals: 6,
					imageUrl: null,
					type: 'VOI',
					equivalents: equivalents.ids,
					totalSupply: totalSupply.value
				};
			} else {
				// Try ARC200 contracts first
				const { data: arc200Data, error: arc200Error } = await supabaseMimirClient
					.from('arc200_contracts')
					.select('contract_id, symbol, decimals, image_url, algo_asset_id')
					.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
					.eq('contract_id', targetTokenId)
					.single();

				if (!arc200Error && arc200Data) {
					const [equivalents, totalSupply] = await Promise.all([
						getTokenEquivalents(targetTokenId),
						getTokenTotalSupply(targetTokenId)
					]);
					degraded ||= equivalents.failed || totalSupply.failed;

					tokenInfo = {
						tokenId: arc200Data.contract_id,
						symbol: arc200Data.symbol || 'UNKNOWN',
						decimals: arc200Data.decimals || 0,
						imageUrl: arc200Data.image_url || null,
						algoAssetId: arc200Data.algo_asset_id || null,
						type: 'ARC200',
						equivalents: equivalents.ids,
						totalSupply: totalSupply.value
					};
				} else {
					// Fallback to assets table for ASA
					degraded ||= !!arc200Error && arc200Error.code !== 'PGRST116';
					const { data: assetData, error: assetError } = await supabaseMimirClient
						.from('asset')
						.select('params')
						.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
						.eq('index', targetTokenId)
						.single();

					if (!assetError && assetData && assetData.params) {
						const params = assetData.params as any;
						const [equivalents, totalSupply] = await Promise.all([
							getTokenEquivalents(targetTokenId),
							getTokenTotalSupply(targetTokenId)
						]);
						degraded ||= equivalents.failed || totalSupply.failed;

						tokenInfo = {
							tokenId: targetTokenId,
							symbol: params.un || 'UNKNOWN',
							decimals: params.dc || 0,
							imageUrl: null,
							type: 'ASA',
							equivalents: equivalents.ids,
							totalSupply: totalSupply.value
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
				degraded ||= equivalents.failed || totalSupply.failed;

				tokenInfo = {
					tokenId: 0,
					symbol: 'VOI',
					decimals: 6,
					imageUrl: null,
					type: 'VOI',
					equivalents: equivalents.ids,
					totalSupply: totalSupply.value
				};
			} else {
				// Case-insensitive match on symbol in ARC200 contracts
				const { data, error } = await supabaseMimirClient
					.from('arc200_contracts')
					.select('contract_id, symbol, decimals, image_url')
					.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
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
				degraded ||= equivalents.failed || totalSupply.failed;

				tokenInfo = {
					tokenId: row.contract_id,
					symbol: row.symbol || 'UNKNOWN',
					decimals: row.decimals || 0,
					imageUrl: row.image_url || null,
					type: 'ARC200',
					equivalents: equivalents.ids,
					totalSupply: totalSupply.value
				};
			}
		} else {
			return json({ info: null });
		}

		return json(
			{
				info: tokenInfo
			},
			{
				headers: degraded
					? undefined
					: publicCache(
							CACHE_TTL['token-info'].sMaxAge,
							CACHE_TTL['token-info'].staleWhileRevalidate
						)
			}
		);
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
