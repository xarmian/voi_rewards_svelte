// A deliberate picker action navigates unless the current attempt is pinned.
type Wallet = { address: string; app: string };

export function pickNavigation({
	pick,
	routeAddress,
	pinned
}: {
	pick: Pick<Wallet, 'address'>;
	routeAddress: string | null | undefined;
	pinned: boolean;
}): string | null {
	if (pinned || pick.address === routeAddress) return null;
	return `/wallet/${pick.address}`;
}
