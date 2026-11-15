import { UPSTREAM_TIMEOUT_MS } from '$lib/server/fetchWithTimeout';
import { CACHE_TTL, publicCache } from '$lib/server/httpCache';
import { mimirClient as supabaseMimirClient } from '$lib/mimir';
import { json } from '@sveltejs/kit';
import { validateMimirParams } from '$lib/server/validate';
import type { RequestEvent } from './$types';

export async function GET({ url, request }: RequestEvent) {
	const action = url.searchParams.get('action');
	const uncached =
		action === 'get_arc200_tokens' ||
		(action === 'get_arc200_transfers' && !url.searchParams.has('p_contractid'));
	const errorHeaders = uncached ? { 'Cache-Control': 'no-store' } : undefined;
	try {
		const validation = validateMimirParams(url.searchParams);
		if ('error' in validation) {
			return json({ error: validation.error }, { status: 400, headers: errorHeaders });
		}
		const { action, params } = validation;

		const { data, error } = await supabaseMimirClient
			.rpc(action, action === 'get_arc200_tokens' ? { params } : params)
			.abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]));

		if (error) {
			console.error('Error:', error);
			return json({ error: error.message }, { status: 500, headers: errorHeaders });
		}

		return json(
			{ data },
			{
				headers: uncached
					? { 'Cache-Control': 'no-store' }
					: publicCache(CACHE_TTL.mimir.sMaxAge, CACHE_TTL.mimir.staleWhileRevalidate)
			}
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to fetch data';
		return json({ error: message }, { status: 500, headers: errorHeaders });
	}
}
