import { ALGOD_SERVER } from '$lib/utils/algodServer';

/** An account's VOI balance from algod REST; no algosdk, so the home graph stays small. */
export async function fetchBalance(addr: string, fetchFn: typeof fetch = fetch): Promise<number> {
	const response = await fetchFn(`${ALGOD_SERVER}/v2/accounts/${addr}?exclude=all`);
	if (!response.ok) throw new Error(`algod account HTTP ${response.status}`);
	const { amount } = (await response.json()) as { amount?: unknown };
	if (typeof amount !== 'number' || !Number.isFinite(amount))
		throw new Error('algod account: no amount');
	return amount / 1e6;
}

/** Full-epoch reward over balance, times 52 weekly epochs, in percent. */
export function estApr(epochReward: number | null, balance: number | null): number | null {
	if (epochReward === null || balance === null || !(balance > 0)) return null;
	const apr = (epochReward / balance) * 52 * 100;
	return Number.isFinite(apr) ? apr : null;
}
