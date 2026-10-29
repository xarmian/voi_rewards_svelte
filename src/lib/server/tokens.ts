import type { PoolCatalog } from '$lib/types/ohlcv.types';

export interface UniqueToken {
	id: number;
	symbol: string;
	decimals: number;
	type: 'VOI' | 'ARC200' | 'ASA' | 'UNKNOWN';
	poolCount: number;
	imageUrl: string | null;
}

export function uniqueTokens(pools: PoolCatalog[], query: string): UniqueToken[] {
	// Extract unique tokens from both token_a and token_b, normalizing wVOI to VOI
	const tokenMap = new Map<string, UniqueToken>(); // Use symbol as key for normalization

	function getTokenImageUrl(id: number, symbol: string): string | null {
		// VOI tokens use special icon
		if (symbol.toUpperCase() === 'VOI' || symbol.toUpperCase() === 'WVOI') {
			return '/icons/voi-token.png';
		}
		// For other tokens, use Nautilus Asset Verification Service
		return `https://asset-verification.nautilus.sh/icons/${id}.png`;
	}

	function normalizeToken(id: number, symbol: string, decimals: number, type: string): UniqueToken {
		const normalizedSymbol = symbol.toUpperCase() === 'WVOI' ? 'VOI' : symbol;
		const normalizedType =
			symbol.toUpperCase() === 'WVOI' || symbol.toUpperCase() === 'VOI' ? 'VOI' : type;

		return {
			id: id,
			symbol: normalizedSymbol,
			decimals: decimals,
			type: normalizedType as 'VOI' | 'ARC200' | 'ASA' | 'UNKNOWN',
			poolCount: 0,
			imageUrl: getTokenImageUrl(id, normalizedSymbol)
		};
	}

	// TASK-74: the icon host has no image for ASA ids whose ARC200 wrapper shares the symbol
	// (302190 and 302189 404; 395614 and 413153 exist), so icons come from the lowest non-ASA id.
	const iconIds = new Map<string, number>();

	function addToken(token: UniqueToken) {
		if (token.type !== 'ASA') {
			const iconId = iconIds.get(token.symbol);
			if (iconId === undefined || token.id < iconId) iconIds.set(token.symbol, token.id);
		}
		const current = tokenMap.get(token.symbol);
		const preferred =
			!current ||
			(token.type === 'ASA' && current.type !== 'ASA') ||
			((token.type === 'ASA') === (current.type === 'ASA') && token.id < current.id);
		if (preferred) {
			token.poolCount = (current?.poolCount ?? 0) + 1;
			tokenMap.set(token.symbol, token);
		} else {
			current.poolCount++;
		}
	}

	pools.forEach((pool) => {
		// Add token_a (normalized)
		const tokenA = normalizeToken(
			pool.token_a_id,
			pool.token_a_symbol,
			pool.token_a_decimals,
			pool.token_a_type
		);
		addToken(tokenA);

		// Add token_b (normalized)
		const tokenB = normalizeToken(
			pool.token_b_id,
			pool.token_b_symbol,
			pool.token_b_decimals,
			pool.token_b_type
		);
		addToken(tokenB);
	});

	// Convert to array and filter by query if provided
	let tokens = Array.from(tokenMap.values(), (token) => {
		const iconId = iconIds.get(token.symbol);
		return token.type === 'ASA' && iconId !== undefined
			? { ...token, imageUrl: getTokenImageUrl(iconId, token.symbol) }
			: token;
	});

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
	return tokens;
}
