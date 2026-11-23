import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, expect, test, vi } from 'vitest';
import * as bridgeAvailability from '$lib/chain/bridgeAvailability';
import * as signerGate from '$lib/chain/signerGate';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');

function componentScript(
	loadComponent: (path: string) => Promise<unknown>,
	overrides: Record<string, unknown> = {}
) {
	const script = source
		.split('<script lang="ts">')[1]
		.split('</script>')[0]
		.replace(/^\s*import[\s\S]*?from ['"][^'"]+['"];$/gm, '')
		.replace(/export let /g, 'let ');
	const error = vi.fn();
	const context = createContext({
		...signerGate,
		$selectedWallet: undefined,
		createHoldingsTokenLoader: () => vi.fn(),
		$connectedWallets: [{ address: 'Y', app: 'pera' }],
		$voiPrice: { price: 0 },
		browser: false,
		console: { error },
		loadComponent,
		...bridgeAvailability,
		...overrides
	});
	runInContext(
		ts.transpileModule(script, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
			transformers: {
				before: [
					(context) => {
						const visit: ts.Visitor = (node) => {
							if (
								ts.isCallExpression(node) &&
								node.expression.kind === ts.SyntaxKind.ImportKeyword
							) {
								return context.factory.updateCallExpression(
									node,
									context.factory.createIdentifier('loadComponent'),
									node.typeArguments,
									node.arguments
								);
							}
							return ts.visitEachChild(node, visit, context);
						};
						return (node) => ts.visitNode(node, visit) as ts.SourceFile;
					}
				]
			}
		}).outputText,
		context
	);
	return { run: (code: string) => runInContext(code, context), error };
}

// Sending needs a known balance: the Send handler refuses to open until the account part has loaded.
const loadedAccount = `walletAddress = 'Y'; accountPart = { status: 'loaded', value: { balance: 5_000_000, status: 'Online', minBalance: 100000, pendingRewards: 0, round: 1 } }`;

for (const [label, component, state, setup, text = label] of [
	['Send', 'SendTokenModal', 'showSendVoiModal', loadedAccount],
	[
		'Bridge',
		'BridgeModal',
		'showBridgeModal',
		"walletAddress = 'Y'; ",
		"\\{BRIDGE_ENABLED \\? 'Bridge' : 'Bridge status'\\}"
	],
	['History', 'TokenTransfersModal', 'showVoiTransfersModal', '']
]) {
	// Read the actual button binding so an unwired handler cannot make this pass.
	const handler = source.match(
		new RegExp(`on:click=\\{([^}]+)\\}[^>]*>\\s*<i\\b[^>]*></i>\\s*${text}\\s*<`)
	)?.[1];

	test(`${label} loads only on opening and reuses the component on the second open`, async () => {
		const pending = Promise.withResolvers<{ default: object }>();
		const load = vi.fn(() => pending.promise);
		const { run } = componentScript(load);
		if (setup) run(setup);
		expect(load).not.toHaveBeenCalled();
		expect(handler).toBeDefined();
		const first = run(`(${handler})()`);
		expect(load).toHaveBeenCalledExactlyOnceWith(`./${component}.svelte`);
		expect(run(state)).toBe(false);
		const loaded = {};
		pending.resolve({ default: loaded });
		await first;
		expect(run(component)).toBe(loaded);
		expect(run(state)).toBe(true);
		run(`${state} = false`);
		await run(`(${handler})()`);
		expect(load).toHaveBeenCalledTimes(1);
		expect(run(state)).toBe(true);
	});

	test(`${label} logs an import failure, stays closed and can retry`, async () => {
		const failure = new Error('chunk unavailable');
		const load = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ default: {} });
		const { run, error } = componentScript(load);
		if (setup) run(setup);
		await run(`(${handler})()`);
		expect(run(state)).toBe(false);
		expect(error).toHaveBeenCalledWith(expect.any(String), failure);
		await run(`(${handler})()`);
		expect(load).toHaveBeenCalledTimes(2);
		expect(run(state)).toBe(true);
	});
}

for (const status of ['loading', 'unavailable']) {
	test(`Send does not open while the account is ${status}`, async () => {
		const load = vi.fn().mockResolvedValue({ default: {} });
		const { run } = componentScript(load);
		const handler = source.match(/on:click=\{([^}]+)\}[^>]*>\s*<i\b[^>]*><\/i>\s*Send\s*</)?.[1];
		expect(handler).toBeDefined();
		run(
			status === 'loading'
				? `accountPart = { status: 'loading' }`
				: `accountPart = { status: 'unavailable', error: 'fetch failed' }`
		);
		await run(`(${handler})()`);
		expect(run('showSendVoiModal'), 'a send needs a known balance').toBe(false);
	});
}

for (const name of ['openSendVoiModal', 'openBridgeModal']) {
	test(`${name} refuses an import that finishes after the page or signing entry changes`, async () => {
		for (const change of ["walletAddress = 'Z'", '$connectedWallets = []']) {
			const pending = Promise.withResolvers<{ default: object }>();
			const { run } = componentScript(() => pending.promise);
			run(loadedAccount);
			const attempt = run(`${name}()`);
			run(change);
			pending.resolve({ default: {} });
			await attempt;
			expect(run(name === 'openSendVoiModal' ? 'showSendVoiModal' : 'showBridgeModal')).toBe(false);
		}
	});
}

// The markup gate around the Bridge button, read from the source so the test runs the real condition.
const bridgeGate = source.match(/\{#if ([^}]+)\}<button\s+on:click=\{openBridgeModal\}/)?.[1];
const bridgeRead = source.match(/^\t\$: if \(!showBridgeModal\)[^;]+;$/m)?.[0];
const bridgeRecord = (wallet: string) =>
	JSON.stringify([
		{
			kind: 'bridge',
			wallet,
			txIds: ['T'],
			firstTxId: 'T',
			lastValid: 100,
			recipients: [{ address: 'BRIDGE', amount: '1' }],
			symbol: 'VOI',
			createdAt: 1
		}
	]);

function bridgeOffered(saved: Record<string, string>, overrides: Record<string, unknown> = {}) {
	const values = new Map(Object.entries(saved));
	vi.stubGlobal('localStorage', {
		getItem: (name: string) => values.get(name) ?? null,
		setItem: (name: string, value: string) => void values.set(name, value),
		removeItem: (name: string) => void values.delete(name)
	});
	const { run } = componentScript(vi.fn(), { browser: true, ...overrides });
	expect(bridgeGate).toBeDefined();
	expect(bridgeRead).toBeDefined();
	// The vm runs reactive statements once, so replay the component's own read as Svelte would.
	const set = (code: string) => run(`${code}; ${bridgeRead}`);
	set("walletAddress = 'Y'");
	return { offered: () => run(`(${bridgeGate})`), set, values };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

test('with bridging off, no Bridge button is offered without a bridge in flight', () => {
	const { offered } = bridgeOffered({
		'voirewards:pending-sends:Z': bridgeRecord('Z')
	});
	expect(offered(), 'another wallet has the bridge').toBe(false);
});

test('a wallet with a bridge in flight is offered Bridge status', () => {
	const { offered } = bridgeOffered({ 'voirewards:pending-sends:Y': bridgeRecord('Y') });
	expect(offered()).toBe(true);
	expect(source).toMatch(
		/title=\{BRIDGE_ENABLED \? 'Bridge VOI' : 'Check a bridge transfer in progress'\}/
	);
});

test('the Bridge status button goes away once the tracker clears the record', () => {
	const { offered, set, values } = bridgeOffered({
		'voirewards:pending-sends:Y': bridgeRecord('Y')
	});
	expect(offered()).toBe(true);
	set('showBridgeModal = true');
	values.delete('voirewards:pending-sends:Y');
	expect(offered(), 'the open modal keeps its button until it closes').toBe(true);
	set('showBridgeModal = false');
	expect(offered()).toBe(false);
});

test('the Bridge status button is only for the connected account', () => {
	const { offered } = bridgeOffered(
		{ 'voirewards:pending-sends:Y': bridgeRecord('Y') },
		{ $connectedWallets: [] }
	);
	expect(offered()).toBe(false);
});

test('with bridging on, the Bridge button is offered as before', () => {
	const { offered } = bridgeOffered({}, { BRIDGE_ENABLED: true });
	expect(offered()).toBe(true);
});
