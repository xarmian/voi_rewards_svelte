export interface CirculatingSupplyData {
	circulatingSupply: string;
	distributedSupply: string;
	percentDistributed: string;
	lockedAccounts: string[];
	distributingAccounts: string[];
}

export async function fetchCirculatingSupply(options?: {
	signal?: AbortSignal;
}): Promise<CirculatingSupplyData> {
	const response = await fetch('https://circulating.voi.network/api/circulating-supply', {
		signal: options?.signal
	});
	if (!response.ok) {
		throw new Error('Failed to fetch circulating supply data');
	}
	return response.json();
}
