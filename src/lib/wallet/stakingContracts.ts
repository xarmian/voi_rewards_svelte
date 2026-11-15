export interface StakingContract {
	address: string;
	contractId: number | string | bigint;
}
export function buildStakingContractMap(
	contracts: readonly StakingContract[],
	available = true
): ReadonlyMap<string, string> {
	void contracts;
	void available;
	return new Map();
}
