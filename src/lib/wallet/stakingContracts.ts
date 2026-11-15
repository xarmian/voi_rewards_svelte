export interface StakingContract {
	address: string;
	contractId: number | string | bigint;
}
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
		if (id < 0n) continue;
		result.set(address, id.toString());
	}
	return result;
}
