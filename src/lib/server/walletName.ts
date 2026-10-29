import { isValidAddress } from 'algosdk';
import { fetchWithTimeout } from './fetchWithTimeout';

export async function resolveWalletName(
	name: string,
	fetchFn: typeof fetch,
	timeoutMs = 3000
): Promise<{ kind: 'address'; address: string } | { kind: 'not-found' } | { kind: 'unavailable' }> {
	try {
		const response = await fetchWithTimeout(
			`https://api.envoi.sh/api/address/${encodeURIComponent(name.toLowerCase())}`,
			{ timeoutMs, fetch: fetchFn }
		);
		if (response.status !== 200) return { kind: 'unavailable' };

		const body = await response.json();
		if (!Array.isArray(body?.results)) return { kind: 'unavailable' };
		const first = body.results[0];
		if (first === undefined || first?.address === null) return { kind: 'not-found' };
		const address = first?.address;
		if (typeof address === 'string' && isValidAddress(address)) {
			return { kind: 'address', address };
		}
	} catch {
		return { kind: 'unavailable' };
	}
	return { kind: 'unavailable' };
}
