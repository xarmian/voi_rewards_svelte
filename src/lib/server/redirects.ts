export type Redirect = { status: 302 | 308; location: string };

// Every row redirects for every request method: none of the sources has a page or action left.
export function redirectFor(url: URL): Redirect | null {
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

	for (const [from, to, nested] of [
		['/what_is_voi', '/about', false],
		['/accounts/auth', '/archive/testnet', false],
		['/accounts', '/archive/testnet', false],
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
