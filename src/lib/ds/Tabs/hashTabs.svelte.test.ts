import { afterEach, expect, it, vi } from 'vitest';
import { createHashTabs } from './hashTabs.svelte';
import { WALLET_TABS } from './hash';
const hooks = vi.hoisted(() => ({
	mounts: [] as (() => (() => void) | void)[],
	navigations: [] as (() => void)[]
}));
vi.mock('svelte', () => ({
	tick: async () => {},
	onMount: (fn: () => (() => void) | void) => hooks.mounts.push(fn)
}));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$app/state', () => ({ page: { state: {} } }));
vi.mock('$app/navigation', () => ({
	afterNavigate: (fn: () => void) => hooks.navigations.push(fn),
	replaceState: vi.fn()
}));
afterEach(() => {
	vi.unstubAllGlobals();
	hooks.mounts = [];
	hooks.navigations = [];
});
it('follows navigation from owner contracts to a hashless contract and back', () => {
	const location = new URL('https://example.test/wallet/O#contracts');
	vi.stubGlobal('window', { location, addEventListener: vi.fn(), removeEventListener: vi.fn() });
	const dispose = $effect.root(() => {
		const tabs = createHashTabs({ ids: WALLET_TABS });
		const cleanups = hooks.mounts.map((mount) => mount());
		expect(tabs.current).toBe('contracts');
		location.href = 'https://example.test/wallet/C';
		hooks.navigations.forEach((navigate) => navigate());
		expect(tabs.current).toBe('overview');
		location.href = 'https://example.test/wallet/O#contracts';
		hooks.navigations.forEach((navigate) => navigate());
		expect(tabs.current).toBe('contracts');
		location.href = 'https://example.test/wallet/X#epochs';
		hooks.navigations.forEach((navigate) => navigate());
		expect(tabs.current).toBe('rewards');
		cleanups.forEach((cleanup) => cleanup?.());
	});
	dispose();
});
