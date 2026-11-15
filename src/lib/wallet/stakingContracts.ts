export interface StakingContract {
	address: string;
	contractId: number | string | bigint;
}
const MAX_APPLICATION_ID = 2n ** 64n - 1n;
export function buildStakingContractMap(
	contracts: readonly StakingContract[],
	available = true
): ReadonlyMap<string, string> {
	const result = new Map<string, string>();
	if (!available) return result;
	for (const { address, contractId } of contracts) {
		if (
			(typeof contractId === 'number' && !Number.isSafeInteger(contractId)) ||
			(typeof contractId === 'string' && !/^\d+$/.test(contractId))
		)
			continue;
		const id = BigInt(contractId);
		if (id < 1n || id > MAX_APPLICATION_ID) continue;
		result.set(address, id.toString());
	}
	return result;
}
