import { pageAccountState } from '$lib/chain/signerGate';
export type NavKey = 'home' | 'staking' | 'network' | 'node' | 'ecosystem';
export const navItems: { key: NavKey; label: string; href: string }[] = [
	{ key: 'home', label: 'Home', href: '/' },
	{ key: 'staking', label: 'My staking', href: '/wallet' },
	{ key: 'network', label: 'Network', href: '/analytics' },
	{ key: 'node', label: 'Run a node', href: '/how_to_node' },
	{ key: 'ecosystem', label: 'Ecosystem', href: '/directory' }
];

export function navCurrent(pathname: string): NavKey | null {
	const path = pathname.replace(/\/+$/, '') || '/';
	if (path === '/') return 'home';
	if (path === '/wallet' || path.startsWith('/wallet/')) return 'staking';
	if (path === '/analytics' || path.startsWith('/analytics/')) return 'network';
	if (['/how_to_node', '/calculator', '/faq', '/vanity'].includes(path)) return 'node';
	if (path === '/directory' || path.startsWith('/directory/') || path === '/markets')
		return 'ecosystem';
	return null;
}

type NavAccount = { address: string; app: string; walletId: string };
export function myStakingHref(
	connected: readonly NavAccount[],
	selected: NavAccount | null
): string {
	const pair =
		selected &&
		connected.find(
			(entry) => entry.address === selected.address && entry.walletId === selected.walletId
		);
	const current = pair && pageAccountState(pair.address, [pair]);
	if (current && current.state === 'yours') return `/wallet/${pair.address}`;
	const first = connected.find(
		(entry) => pageAccountState(entry.address, [entry]).state === 'yours'
	);
	return first ? `/wallet/${first.address}` : '/wallet';
}
