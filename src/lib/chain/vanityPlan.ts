import { isValidAddress } from 'algosdk';

export type VanityPlan = { funder: string; rekeyTo: string; vanity: string };
type Selection = { address: string; app: string } | null | undefined;

export function capturePlan(
	selected: Selection,
	vanityAddress: string | undefined
): { ok: true; plan: VanityPlan } | { ok: false; error: string } {
	if (!selected || selected.app === 'Watch') {
		return { ok: false, error: 'Please connect a wallet first' };
	}
	if (!vanityAddress) return { ok: false, error: 'Generate a vanity address first' };
	if (!isValidAddress(selected.address) || !isValidAddress(vanityAddress)) {
		return { ok: false, error: 'Invalid account or vanity address' };
	}
	return {
		ok: true,
		plan: { funder: selected.address, rekeyTo: selected.address, vanity: vanityAddress }
	};
}

export function selectionDrifted(plan: VanityPlan, selected: Selection): boolean {
	return selected?.address !== plan.rekeyTo;
}
