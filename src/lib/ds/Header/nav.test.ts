import { test } from 'vitest';
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
	['/markets', 'ecosystem'],
	['/about', null],
	['/walletx', null],
	['/ds', null],
	['/ecosystem', null],
	['/directoryx', null],
	['/analytics/other', null],
	['/faq/other', null]
] as const) {
	test(`navCurrent ${path} matches whole segments and ignores trailing slashes`, () => {
		assert.equal(navCurrent(path), expected);
		assert.equal(navCurrent(path === '/' ? '/' : `${path}/`), expected);
	});
}
test('navigation destinations and labels', () => {
	assert.deepEqual(navItems, [
		{ key: 'home', label: 'Home', href: '/' },
		{ key: 'staking', label: 'My staking', href: '/wallet' },
		{ key: 'network', label: 'Network', href: '/analytics' },
		{ key: 'node', label: 'Run a node', href: '/how_to_node' },
		{ key: 'ecosystem', label: 'Ecosystem', href: '/directory' }
	]);
});
