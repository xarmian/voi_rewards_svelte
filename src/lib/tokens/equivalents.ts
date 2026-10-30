import { UPSTREAM_TIMEOUT_MS } from '$lib/server/fetchWithTimeout';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mimirClient } from '$lib/mimir';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MimirClient = SupabaseClient<any, any, any>;

export interface TokenEquivalents {
	ids: number[];
	failed: boolean;
}

/**
 * Read each row's contract_id, then its token_id when it is a string without a
 * comma and parseInt(token_id, 10) is finite ('0' counts). Exclude tokenId itself
 * and deduplicate in first-seen order, preserving row order and contract_id first.
 * Empty or null data without an error is a valid, cacheable answer: { ids: [],
 * failed: false }. Any query error (including PGRST116) or thrown error is logged
 * once and returns { ids: [], failed: true }.
 */
export async function getTokenEquivalents(
	tokenId: number,
	client: MimirClient = mimirClient
): Promise<TokenEquivalents> {
	try {
		const { data, error } = await client
			.from('arc200_contracts')
			.select('contract_id, token_id')
			.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
			.or(`contract_id.eq.${tokenId},token_id.eq.${tokenId}`);

		if (error) throw error;

		const ids = new Set<number>();
		for (const row of data || []) {
			if (row.contract_id !== tokenId) ids.add(row.contract_id);
			if (typeof row.token_id === 'string' && !row.token_id.includes(',')) {
				const parsed = parseInt(row.token_id, 10);
				if (Number.isFinite(parsed) && parsed !== tokenId) ids.add(parsed);
			}
		}

		return { ids: Array.from(ids), failed: false };
	} catch (error) {
		console.error('Failed to get token equivalents:', error);
		return { ids: [], failed: true };
	}
}
