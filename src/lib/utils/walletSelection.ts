import type { WalletConnectionResult as Wallet } from 'avm-wallet-svelte';

export function pickNavigation({
	pick,
	routeAddress,
	pinned
}: {
	pick: Wallet;
	routeAddress: string | null | undefined;
	pinned: boolean;
}): string | null {
	if (pinned || pick.address === routeAddress) return null;
	return `/wallet/${pick.address}`;
}

export function selectionFromRoute({
	routeAddress,
	connected,
	selected,
	pinned
}: {
	routeAddress: string | null | undefined;
	connected: Wallet[];
	selected: Wallet | null | undefined;
	pinned: boolean;
}): Wallet | null {
	if (pinned || !routeAddress) return null;
	const withApp = connected.find((wallet) => wallet.address === routeAddress && wallet.app !== '');
	// Already selected: only upgrade a selection that has no app to the connected entry.
	if (routeAddress === selected?.address) {
		return selected.app === '' ? (withApp ?? null) : null;
	}
	return withApp ?? connected.find((wallet) => wallet.address === routeAddress) ?? null;
}
