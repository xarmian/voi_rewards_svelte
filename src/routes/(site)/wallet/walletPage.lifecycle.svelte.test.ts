import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { get } from 'svelte/store';
import { pickNavigation } from '$lib/utils/walletSelection';

vi.hoisted(() => {
	const values = new Map<string, string>();
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => void values.set(key, value),
			removeItem: (key: string) => void values.delete(key)
		}
	});
});
import { walletStore } from 'avm-wallet-svelte';
import { connectedWallets, selectedWallet } from '$lib/chain/wallet.svelte';

const page = readFileSync('src/routes/(site)/wallet/[...id]/+page.svelte', 'utf8');
const library = readFileSync(
	'node_modules/avm-wallet-svelte/dist/components/Web3Wallet.svelte',
	'utf8'
);
const selector = readFileSync(
	'node_modules/avm-wallet-svelte/dist/components/AccountSelector.svelte',
	'utf8'
);
// Execute the installed component's real lifecycle and pick functions without a DOM runner.
// Only providers/network/DOM are doubles; the library store and the app's subscribers are real.
function code(source: string, name: string): string {
	const script = source.slice(source.indexOf('>') + 1, source.indexOf('</script>'));
	const ast = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true);
	const fn = ast.statements.find(
		(node) => ts.isFunctionDeclaration(node) && node.name?.text === name
	);
	if (!fn) throw new Error(`Missing function ${name}`);
	return ts.transpile(fn.getText(ast), {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext
	});
}
const A = {
	address: 'A'.repeat(58),
	walletId: 'kibisis' as const,
	authenticated: false,
	isWatch: false
};
const B = { ...A, address: 'B'.repeat(58) };
afterEach(() => {
	walletStore.reset();
	flushSync();
});
it('one picker lifecycle restores without replacing a user pick and keeps its subscribers live', async () => {
	const seen: string[][] = [];
	const stop = connectedWallets.subscribe((accounts) => seen.push(accounts.map((a) => a.address)));
	const selected: string[] = [];
	const stopSelected = selectedWallet.subscribe((account) => selected.push(account?.address ?? ''));
	try {
		let finishRestore!: (value: Map<string, (typeof A)[]>) => void;
		const restore = new Promise<Map<string, (typeof A)[]>>((resolve) => {
			finishRestore = resolve;
		});
		const initialize = runInNewContext(`${code(library, 'initializeWallet')}; initializeWallet`, {
			walletStore,
			providerStore: { initialize: async () => {}, genesisId: 'test' },
			registry: { initialize: async () => {}, reconnectAll: () => restore },
			onWalletConnectModal: () => () => {},
			uiStore: {},
			scopeId: 'default',
			wcUnsubscribe: null,
			initError: null,
			enabledWallets: ['kibisis'],
			allowWatchAccounts: true,
			algodClient: {},
			indexerClient: {},
			wcConfig: {},
			console
		});
		// Run the actual onMount callback once (the DOM listener is the only absent browser part).
		const mountScript = library.slice(
			library.indexOf('onMount(() => {'),
			library.indexOf('async function initializeWallet')
		);
		let pending: Promise<void> = Promise.resolve();
		runInNewContext(mountScript, {
			onMount: (callback: () => void) => callback(),
			initializeWallet: () => {
				pending = initialize();
			}
		});
		expect(selector).toContain('const accounts = $derived(walletStore.accounts)');
		walletStore.addAccounts([B]);
		walletStore.selectAccount(B);
		flushSync();
		finishRestore(new Map([['kibisis', [A]]]));
		await pending;
		flushSync();
		expect(get(selectedWallet)?.address).toBe(B.address);
		expect(seen.at(-1)).toContain(A.address);
		const goto = vi.fn();
		const context = {
			walletId: 'UNCONNECTED',
			parentWalletId: null,
			pinnedFlows: {
				subscribe: (run: (n: number) => void) => {
					run(0);
					return () => {};
				}
			},
			get,
			goto,
			pickNavigation
		};
		const picked = runInNewContext(
			`${code(page, 'handleAccountPicked')}; handleAccountPicked`,
			context
		);
		const select = runInNewContext(`${code(selector, 'handleSelect')}; handleSelect`, {
			walletStore,
			accountMode: 'navigation',
			onAccountPicked: picked,
			onClose: undefined
		});
		select(A);
		flushSync();
		expect(goto).toHaveBeenCalledWith(`/wallet/${A.address}`, { invalidateAll: true });
		expect(selected.at(-1)).toBe(B.address);
		const C = { ...A, address: 'C'.repeat(58) };
		walletStore.addAccounts([C]);
		flushSync();
		expect(seen.at(-1)).toContain(C.address);
	} finally {
		stop();
		stopSelected();
	}
});
it('search navigation leaves a connected selection and pin count unchanged', () => {
	walletStore.addAccounts([A]);
	walletStore.selectAccount(A);
	flushSync();
	const goto = vi.fn();
	const search = runInNewContext(`${code(page, 'searchWallet')}; searchWallet`, { goto });
	search(B.address);
	flushSync();
	expect(goto).toHaveBeenCalledWith(`/wallet/${B.address}`, { invalidateAll: true });
	expect(get(selectedWallet)?.address).toBe(A.address);
});

it('explicit picks and Add completion navigate, while passive updates and removal keep the URL', async () => {
	const goto = vi.fn();
	let pins = 0;
	const context = {
		walletId: 'CONTRACT',
		parentWalletId: A.address,
		pinnedFlows: {
			subscribe(run: (n: number) => void) {
				run(pins);
				return () => {};
			}
		},
		get,
		goto,
		pickNavigation
	};
	const picked = runInNewContext(
		`${code(page, 'handleAccountPicked')}; handleAccountPicked`,
		context
	);
	const select = runInNewContext(`${code(selector, 'handleSelect')}; handleSelect`, {
		walletStore,
		accountMode: 'navigation',
		onAccountPicked: picked,
		onClose: undefined
	});
	walletStore.addAccounts([A, B]);
	flushSync();
	expect(goto).not.toHaveBeenCalled();
	select(A);
	expect(goto).toHaveBeenCalledExactlyOnceWith(`/wallet/${A.address}`, { invalidateAll: true });
	goto.mockClear();
	context.walletId = A.address;
	select(A);
	expect(goto).not.toHaveBeenCalled();
	walletStore.selectAccount(B);
	walletStore.removeAccount(A.walletId, A.address);
	flushSync();
	expect(goto).not.toHaveBeenCalled();
	pins = 1;
	select(B);
	expect(goto).not.toHaveBeenCalled();
	pins = 0;
	const add = readFileSync(
		'node_modules/avm-wallet-svelte/dist/components/AddAccountView.svelte',
		'utf8'
	);
	const connect = runInNewContext(`${code(add, 'handleConnect')}; handleConnect`, {
		connectingWallet: null,
		walletErrors: {},
		registry: { getAdapter: () => ({ connect: async () => [A, B] }) },
		providerStore: { genesisId: 'fixture' },
		walletStore,
		accountMode: 'navigation',
		autoSignIn: false,
		onAccountPicked: picked,
		onClose: undefined,
		console
	});
	await connect({ id: 'kibisis', name: 'Fixture', isWatchOnly: false });
	// The current page pick is a no-op, even for deliberate Add.
	expect(goto).not.toHaveBeenCalled();
	context.walletId = 'CONTRACT';
	await connect({ id: 'kibisis', name: 'Fixture', isWatchOnly: false });
	expect(goto).toHaveBeenCalledExactlyOnceWith(`/wallet/${A.address}`, { invalidateAll: true });
});
