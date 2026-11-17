import { ARC72_PAGE_LIMIT, assertArc72Query, type Arc72Query } from '$lib/wallet/arc72Export';

export function createArc72Reader(fetcher: typeof fetch = fetch) {
	async function read(params: URLSearchParams, signal: AbortSignal): Promise<unknown> {
		signal.throwIfAborted();
		const response = await fetcher(`/api/mimir?${params}`, { signal, cache: 'no-store' });
		if (!response.ok)
			throw Object.assign(new Error(`NFT request failed (${response.status}).`), {
				response: { status: response.status, headers: response.headers }
			});
		const body: unknown = await response.json();
		signal.throwIfAborted();
		if (
			!body ||
			typeof body !== 'object' ||
			Array.isArray(body) ||
			'error' in body ||
			!('data' in body) ||
			body.data === null ||
			body.data === undefined
		)
			throw new SyntaxError('Invalid NFT proxy envelope.');
		return body.data;
	}
	return {
		// One read per window: the offset is always zero, because offset paging can split tied rows.
		async readArc72Page(query: Arc72Query, signal: AbortSignal): Promise<unknown> {
			assertArc72Query(query);
			return read(
				new URLSearchParams({
					action: 'get_arc72_transfers',
					user: query.address,
					'min-round': query.minRound.toString(),
					'max-round': query.maxRound.toString(),
					limit: String(ARC72_PAGE_LIMIT),
					'next-token': '0'
				}),
				signal
			);
		}
	};
}
