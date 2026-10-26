import { mimirClient as supabaseMimirClient } from '$lib/mimir';
import type { LockContract } from '$lib/data/types';

// Staking (lockvest) contracts, indexed in Mimir's scs_accounts view. This
// replaces mainnet-idx.nautilus.sh/v1/scs/accounts.
const TIMEOUT_MS = 5000;

export async function getLockContractByAddress(
	contractAddress: string
): Promise<LockContract | null> {
	const { data, error } = await supabaseMimirClient
		.from('scs_accounts')
		.select('*')
		.eq('contractAddress', contractAddress)
		.abortSignal(AbortSignal.timeout(TIMEOUT_MS))
		.maybeSingle();

	if (error) throw error;
	return (data as LockContract | null) ?? null;
}

export async function getLockContractsByOwner(owner: string): Promise<LockContract[]> {
	const { data, error } = await supabaseMimirClient
		.from('scs_accounts')
		.select('*')
		.eq('global_owner', owner)
		.abortSignal(AbortSignal.timeout(TIMEOUT_MS));

	if (error) throw error;
	return (data as LockContract[] | null) ?? [];
}
