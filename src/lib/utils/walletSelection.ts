// The shape these helpers need from a wallet. Callers keep their own richer type (walletId, name),
// so a selection returned from here can be handed straight to selectWallet.
type Wallet = { address: string; app: string };

export function pickNavigation({
	pick,
	routeAddress,
	parentAddress,
	pinned
}: {
	pick: Pick<Wallet, 'address'>;
	routeAddress: string | null | undefined;
	// The owner account when the route is one of its contracts: that pick is already "shown".
	parentAddress?: string | null;
	pinned: boolean;
}): string | null {
	if (pinned || pick.address === routeAddress || pick.address === parentAddress) return null;
	return `/wallet/${pick.address}`;
}

export function selectionFromRoute<T extends Wallet>({
	routeAddress,
	connected,
	selected,
	pinned
}: {
	routeAddress: string | null | undefined;
	connected: T[];
	selected: Wallet | null | undefined;
	pinned: boolean;
}): T | null {
	if (pinned || !routeAddress) return null;
	const withApp = connected.find((wallet) => wallet.address === routeAddress && wallet.app !== '');
	// Already selected: only upgrade a selection that has no app to the connected entry.
	if (routeAddress === selected?.address) {
		return selected.app === '' ? (withApp ?? null) : null;
	}
	return withApp ?? connected.find((wallet) => wallet.address === routeAddress) ?? null;
}
