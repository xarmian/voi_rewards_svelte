export type Redirect = { status: 302 | 308; location: string };

export function redirectFor(url: URL, method: string): Redirect | null {
	if (url.hostname === 'quests.voirewards.com') {
		return {
			status: 308,
			location: `https://voirewards.com/archive/testnet/quests${url.search}`
		};
	}

	const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');
	if (path === '/arc72' || path.startsWith('/arc72/')) {
		const destination = path.slice('/arc72'.length);
		const valid =
			/^\/collection\/[0-9]+(?:\/token\/[0-9]+)?$/.test(destination) ||
			/^\/portfolio\/[A-Za-z0-9._-]{1,100}$/.test(destination);
		return { status: 302, location: `https://nftnavigator.xyz${valid ? destination : '/'}` };
	}

	if (path === '/what_is_voi') {
		return { status: 308, location: `/about${url.search}#what-is-voi` };
	}

	if (
		(path === '/accounts' || path === '/accounts/auth') &&
		(method === 'GET' || method === 'HEAD')
	) {
		return { status: 308, location: `/archive/testnet${url.search}` };
	}

	for (const [from, to, nested] of [
		['/ecosystem', '/directory', true],
		['/phase1', '/archive/testnet/phase1', false],
		['/phase2', '/archive/testnet/phase2', true],
		['/leaderboard', '/archive/testnet/leaderboard', false],
		['/quests', '/archive/testnet/quests', true],
		['/reports', '/archive/testnet/reports', false],
		['/relays', '/archive/testnet/relays', false]
	] as const) {
		if (path === from || (nested && path.startsWith(`${from}/`))) {
			return { status: 308, location: `${to}${path.slice(from.length)}${url.search}` };
		}
	}

	return null;
}
