import type { Arc200Query } from '$lib/wallet/arc200Export';
export function createArc200Reader(_fetcher: typeof fetch = fetch) {
	return {
		async readArc200Page(_query: Arc200Query, _signal: AbortSignal): Promise<unknown> {
			throw new Error('ARC-200 history reader is not implemented.');
		},
		async readArc200Metadata(_id: bigint, _signal: AbortSignal): Promise<unknown> {
			throw new Error('ARC-200 metadata reader is not implemented.');
		}
	};
}
