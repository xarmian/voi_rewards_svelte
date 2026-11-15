import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parse, compileModule } from 'svelte/compiler';
// Runtime required by the compiler output below, rather than handwritten rune internals.
const client = await vi.importActual('svelte/internal/client');
const { flushSync } = await vi.importActual<typeof import('svelte')>('svelte');
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
	replaceState: vi.fn((hash: string) => {
		window.location.hash = hash;
	})
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

// Compile the page's actual effect into the client runtime, so deleting or weakening it
// fails here. No DOM runner/dependency is needed for this rune-driven panel state.
function pageNodePanel(tabs: ReturnType<typeof createHashTabs>) {
	const source = readFileSync('src/routes/(site)/wallet/[...id]/+page.svelte', 'utf8');
	const ast = parse(source, { modern: true });
	const code = (node: unknown) => {
		const { start, end } = node as { start: number; end: number };
		return source.slice(start, end);
	};
	const effects = ast.instance!.content.body.filter(
		(node) =>
			node.type === 'ExpressionStatement' &&
			node.expression.type === 'CallExpression' &&
			node.expression.callee.type === 'Identifier' &&
			node.expression.callee.name === '$effect' &&
			code(node).includes('showNode')
	);
	expect(effects, 'page must keep its consensus-opening effect').toHaveLength(1);
	const effect = code(effects[0]);
	const compiled = compileModule(
		`function panel(tabs) {
		let showNode = $state(false);
		${effect}
		return { get open() { return showNode; }, collapse() { showNode = false; } };
	}`,
		{ filename: 'consensus.svelte.js', generate: 'client' }
	).js.code;
	return runInNewContext(
		compiled.replace(/import \* as \$ from ['"]svelte\/internal\/client['"];?/, '') + '\n panel',
		{ $: client }
	)(tabs) as { open: boolean; collapse: () => void };
}

it('the real page effect opens the Node panel when consensus arrives after creation', () => {
	const location = new URL('https://example.test/wallet/O');
	let hashchange = () => {};
	vi.stubGlobal('window', {
		location,
		addEventListener: (_: string, fn: () => void) => {
			hashchange = fn;
		},
		removeEventListener: vi.fn()
	});
	let panel!: ReturnType<typeof pageNodePanel>;
	let cleanups: ((() => void) | void)[] = [];
	const dispose = $effect.root(() => {
		const tabs = createHashTabs({ ids: WALLET_TABS });
		panel = pageNodePanel(tabs);
		cleanups = hooks.mounts.map((mount) => mount());
	});
	try {
		flushSync();
		expect(panel.open).toBe(false);
		location.hash = '#consensus';
		hashchange();
		flushSync();
		expect(panel.open).toBe(true);
	} finally {
		cleanups.forEach((cleanup) => cleanup?.());
		dispose();
	}
});

it('client navigation to another consensus route reopens a collapsed Node panel', async () => {
	const location = new URL('https://example.test/wallet/O#consensus');
	vi.stubGlobal('window', { location, addEventListener: vi.fn(), removeEventListener: vi.fn() });
	let panel!: ReturnType<typeof pageNodePanel>;
	let cleanups: ((() => void) | void)[] = [];
	const dispose = $effect.root(() => {
		const tabs = createHashTabs({ ids: WALLET_TABS });
		panel = pageNodePanel(tabs);
		cleanups = hooks.mounts.map((mount) => mount());
	});
	try {
		flushSync();
		expect(panel.open).toBe(true);
		// Real replacement semantics: normalization does not dispatch hashchange.
		await vi.waitFor(() => expect(location.hash).toBe('#overview'));
		panel.collapse();
		flushSync();
		expect(panel.open).toBe(false);
		location.href = 'https://example.test/wallet/Y#consensus';
		hooks.navigations.forEach((navigate) => navigate());
		flushSync();
		expect(panel.open).toBe(true);
	} finally {
		cleanups.forEach((cleanup) => cleanup?.());
		dispose();
	}
});

it('focuses the panel after a user hash change without scrolling the page', async () => {
	const focus = vi.fn();
	const listeners: Record<string, () => void> = {};
	const location = new URL('https://example.test/wallet/O#overview');
	vi.stubGlobal('window', {
		location,
		addEventListener: (type: string, listener: () => void) => (listeners[type] = listener),
		removeEventListener: vi.fn()
	});
	const dispose = $effect.root(() => {
		createHashTabs({ ids: WALLET_TABS, panel: () => ({ focus }) as unknown as HTMLElement });
		hooks.mounts.forEach((mount) => mount());
	});
	location.hash = '#holdings';
	listeners.hashchange();
	await new Promise((resolve) => setTimeout(resolve));
	expect(focus).toHaveBeenCalledTimes(1);
	expect(focus).toHaveBeenCalledWith({ preventScroll: true });
	dispose();
});
