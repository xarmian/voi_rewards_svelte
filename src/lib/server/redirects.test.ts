import { expect, test } from 'vitest';
import { redirectFor, type Redirect } from './redirects';

const cases: [string, string, Redirect | null][] = [
	// The quests host root was served by a reroute hook (removed in this change); it must now redirect.
	[
		'https://quests.voirewards.com/',
		'GET',
		{ status: 308, location: 'https://voirewards.com/archive/testnet/quests' }
	],
	[
		'https://quests.voirewards.com/anything?x=1',
		'POST',
		{ status: 308, location: 'https://voirewards.com/archive/testnet/quests?x=1' }
	],
	[
		'https://quests.voirewards.com/arc72',
		'DELETE',
		{ status: 308, location: 'https://voirewards.com/archive/testnet/quests' }
	],
	['/ecosystem', 'GET', { status: 308, location: '/directory' }],
	['/ecosystem/Wallets', 'GET', { status: 308, location: '/directory/Wallets' }],
	[
		'/ecosystem/Wallets%20%26%20Tools',
		'GET',
		{ status: 308, location: '/directory/Wallets%20%26%20Tools' }
	],
	['/ecosystem?x=1', 'GET', { status: 308, location: '/directory?x=1' }],
	['/ecosystem/', 'GET', { status: 308, location: '/directory' }],
	['/ecosystem', 'HEAD', { status: 308, location: '/directory' }],
	['/ecosystem/defi/nested?x=1', 'GET', { status: 308, location: '/directory/defi/nested?x=1' }],
	['/ecosystem//evil.example', 'GET', { status: 308, location: '/directory//evil.example' }],
	['/what_is_voi', 'GET', { status: 308, location: '/about' }],
	['/what_is_voi?x=1', 'GET', { status: 308, location: '/about?x=1' }],
	['/what_is_voi/', 'POST', { status: 308, location: '/about' }],
	['/phase1/', 'GET', { status: 308, location: '/archive/testnet/phase1' }],
	['/phase1?x=1', 'GET', { status: 308, location: '/archive/testnet/phase1?x=1' }],
	['/phase2', 'GET', { status: 308, location: '/archive/testnet/phase2' }],
	[
		'/phase2/ABC/nested?x=1',
		'GET',
		{ status: 308, location: '/archive/testnet/phase2/ABC/nested?x=1' }
	],
	['/leaderboard?x=1', 'GET', { status: 308, location: '/archive/testnet/leaderboard?x=1' }],
	['/quests', 'GET', { status: 308, location: '/archive/testnet/quests' }],
	[
		'/quests/project/nested?x=1',
		'GET',
		{ status: 308, location: '/archive/testnet/quests/project/nested?x=1' }
	],
	['/reports?x=1', 'GET', { status: 308, location: '/archive/testnet/reports?x=1' }],
	['/relays?x=1', 'GET', { status: 308, location: '/archive/testnet/relays?x=1' }],
	['/accounts?x=1', 'GET', { status: 308, location: '/archive/testnet?x=1' }],
	['/accounts/', 'HEAD', { status: 308, location: '/archive/testnet' }],
	['/accounts/auth?x=1', 'GET', { status: 308, location: '/archive/testnet?x=1' }],
	['/accounts/auth/', 'HEAD', { status: 308, location: '/archive/testnet' }],
	['/arc72?x=1', 'GET', { status: 302, location: 'https://nftnavigator.xyz/' }],
	['/arc72/', 'POST', { status: 302, location: 'https://nftnavigator.xyz/' }],
	[
		'/arc72/collection/001?x=1',
		'GET',
		{ status: 302, location: 'https://nftnavigator.xyz/collection/001' }
	],
	[
		'/arc72/collection/123/token/004/?x=1',
		'GET',
		{ status: 302, location: 'https://nftnavigator.xyz/collection/123/token/004' }
	],
	[
		'/arc72/portfolio/AbC-_.09?x=1',
		'GET',
		{ status: 302, location: 'https://nftnavigator.xyz/portfolio/AbC-_.09' }
	],
	[
		`/arc72/portfolio/${'a'.repeat(100)}`,
		'GET',
		{ status: 302, location: `https://nftnavigator.xyz/portfolio/${'a'.repeat(100)}` }
	],
	...[
		'/arc72/collection/nope',
		'/arc72/collection/12x',
		'/arc72/collection/1/token/nope',
		'/arc72/collection/1/token/2/extra',
		'/arc72/portfolio/',
		'/arc72/portfolio/a%2Fb',
		`/arc72/portfolio/${'a'.repeat(101)}`,
		'/arc72/portfolio/https://evil.example',
		'/arc72/unknown',
		'/arc72//evil.example'
	].map((path): [string, string, Redirect] => [
		path,
		'GET',
		{ status: 302, location: 'https://nftnavigator.xyz/' }
	]),
	...[
		'/',
		'/wallet/ABC',
		'/wallet',
		'/directory',
		'/directory/defi',
		'/vanity',
		'/analytics',
		'/api/tokens',
		'/archive/testnet',
		'/archive/testnet/phase1',
		'/phase3',
		'/phase1x',
		'/quests-foo',
		'/ecosystemfoo',
		'/phase2x',
		'/arc72foo',
		'/Phase1',
		'/phase1//',
		'/phase1/nested',
		'/leaderboard/nested',
		'/reports/nested',
		'/relays/nested',
		'/accounts/other',
		'/what_is_voix',
		'https://evilquests.voirewards.com/',
		'https://quests.voirewards.com.evil.com/'
	].map((path): [string, string, null] => [path, 'GET', null]),
	// The account pages and their form actions are gone, so every method redirects.
	...['/accounts', '/accounts/', '/accounts/auth', '/accounts/auth/?x=1'].flatMap((path) =>
		['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'get'].map(
			(method): [string, string, Redirect] => [
				path,
				method,
				{ status: 308, location: `/archive/testnet${path.endsWith('?x=1') ? '?x=1' : ''}` }
			]
		)
	)
];

// The method column names the request each row stands for. redirectFor takes no method, so a row
// proves the answer for that method too; hooks.server.redirects.test.ts checks a POST end to end.
test.each(cases)('%s (%s)', (path, _method, expected) => {
	expect(redirectFor(new URL(path, 'https://voirewards.com'))).toEqual(expected);
});
