import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveHash, WALLET_TABS } from '$lib/ds/Tabs/hash';

const source = readFileSync(new URL('./[...id]/+page.svelte', import.meta.url), 'utf8');
describe('wallet shell hash integration', () => {
	it.each([
		['#portfolio', 'holdings'],
		['#consensus', 'overview'],
		['#proposals', 'overview'],
		['#epochs', 'rewards'],
		['#lockvest', 'contracts'],
		['#calculator', 'calculator'],
		['', 'overview']
	])('%s lands on %s using the shared mount/hashchange controller', (hash, expected) => {
		expect(resolveHash(hash, WALLET_TABS).id).toBe(expected);
		expect(source).toMatch(/createHashTabs\(\{/);
		expect(source).toMatch(/ids:\s*WALLET_TABS/);
		expect(source).toMatch(/current=\{tabs.current\}/);
		expect(source).toMatch(/tabindex="-1"/);
	});
	it('keeps every legacy panel in the shell', () => {
		for (const name of [
			'PortfolioComponent',
			'NodeComponent',
			'ProposalsComponent',
			'EpochComponent',
			'LockVestComponent',
			'CalculatorComponent'
		]) {
			expect(source).toContain(`<${name}`);
		}
	});
	it('mounts exactly one picker and preserves its behavioral props', () => {
		expect(source.match(/<Web3Wallet\b/g)).toHaveLength(1);
		expect(source).toContain('allowWatchAccounts={true}');
		expect(source).toContain('onAccountPicked={handleAccountPicked}');
	});
});
