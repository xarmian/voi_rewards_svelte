import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';
import type { LockContract } from '$lib/data/types';

// Staking (lockvest) contracts, indexed in Mimir's scs_accounts view. This
// replaces mainnet-idx.nautilus.sh/v1/scs/accounts.
const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

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
