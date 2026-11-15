import { assertArc200Bound, assertArc200Query, type Arc200Query } from '$lib/wallet/arc200Export';

export function createArc200Reader(fetcher: typeof fetch = fetch) {
	async function read(params: URLSearchParams, signal: AbortSignal): Promise<unknown> {
		signal.throwIfAborted();
		const response = await fetcher(`/api/mimir?${params}`, { signal, cache: 'no-store' });
		if (!response.ok)
			throw Object.assign(new Error(`ARC-200 request failed (${response.status}).`), {
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
			throw new SyntaxError('Invalid ARC-200 proxy envelope.');
		return body.data;
	}
	return {
		async readArc200Page(query: Arc200Query, signal: AbortSignal): Promise<unknown> {
			assertArc200Query(query);
			return read(
				new URLSearchParams({
					action: 'get_arc200_transfers',
					p_user: query.address,
					p_limit: '100',
					p_offset: '0',
					p_min_round: query.minRound.toString(),
					p_max_round: query.maxRound.toString()
				}),
				signal
			);
		},
		async readArc200Metadata(id: bigint, signal: AbortSignal): Promise<unknown> {
			assertArc200Bound(id);
			return read(
				new URLSearchParams({
					action: 'get_arc200_tokens',
					contractId: id.toString(),
					limit: '1',
					'next-token': '0'
				}),
				signal
			);
		}
	};
}
