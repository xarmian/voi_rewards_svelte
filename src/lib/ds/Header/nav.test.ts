import { expect, test } from 'vitest';
import assert from 'node:assert/strict';
import { navCurrent, navItems } from './nav';

for (const [path, expected] of [
	['/', 'home'],
	['/wallet', 'staking'],
	['/wallet/ABC123', 'staking'],
	['/analytics', 'network'],
	['/how_to_node', 'node'],
	['/calculator', 'node'],
	['/faq', 'node'],
	['/vanity', 'node'],
	['/directory', 'ecosystem'],
	['/directory/defi', 'ecosystem'],
	['/directory/Wallets', 'ecosystem'],
	['/directory/New', 'ecosystem'],
	['/markets', 'ecosystem'],
	['/about', null],
	['/walletx', null],
	['/ds', null],
	['/ecosystem', null],
	['/directoryx', null],
	['/analytics/other', 'network'],
	['/faq/other', null]
] as const) {
	test(`navCurrent ${path} matches whole segments and ignores trailing slashes`, () => {
		assert.equal(navCurrent(path), expected);
		assert.equal(navCurrent(path === '/' ? '/' : `${path}/`), expected);
	});
}
test('token query URLs keep Markets in the Ecosystem section using their pathname', () => {
	const url = new URL('/markets?token=123', 'https://voirewards.com');
	assert.equal(navCurrent(url.pathname), 'ecosystem');
});

test('navigation destinations and labels', () => {
	assert.deepEqual(navItems, [
		{ key: 'home', label: 'Home', href: '/' },
		{ key: 'staking', label: 'My staking', href: '/wallet' },
		{ key: 'network', label: 'Network', href: '/analytics' },
		{ key: 'node', label: 'Run a node', href: '/how_to_node' },
		{ key: 'ecosystem', label: 'Ecosystem', href: '/directory' }
	]);
});

test('My staking uses a connected signing pair and falls back to the first signer', async () => {
	const nav = await import('./nav');
	expect(nav).toHaveProperty('myStakingHref');
	const x = { address: 'X', walletId: 'pera', app: 'pera' };
	const y = { address: 'Y', walletId: 'defly', app: 'defly' };
	const watch = { address: 'W', walletId: 'watch', app: 'Watch' };
	for (const [entries, selected, href] of [
		[[], null, '/wallet'],
		[[watch], watch, '/wallet'],
		[[x, y], y, '/wallet/Y'],
		[[watch, x], watch, '/wallet/X'],
		[[x], { ...x, walletId: 'defly' }, '/wallet/X'],
		[[x], y, '/wallet/X']
	] as const)
		expect(nav.myStakingHref(entries, selected)).toBe(href);
});
