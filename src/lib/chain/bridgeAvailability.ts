import { loadPending } from './pendingSends';

// The single switch that turns starting a bridge back on.
export const BRIDGE_ENABLED = false;

export function hasPendingBridge(
	wallet: string,
	storage?: Parameters<typeof loadPending>[1]
): boolean {
	return loadPending(wallet, storage).some((record) => record.kind === 'bridge');
}
