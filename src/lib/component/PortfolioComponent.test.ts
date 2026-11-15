import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import * as signerGate from '$lib/chain/signerGate';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');

function componentScript(loadComponent: (path: string) => Promise<unknown>) {
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
		loadComponent
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

for (const [label, component, state, setup] of [
	['Send', 'SendTokenModal', 'showSendVoiModal', loadedAccount],
	['Bridge', 'BridgeModal', 'showBridgeModal', "walletAddress = 'Y'; "],
	['History', 'TokenTransfersModal', 'showVoiTransfersModal', '']
]) {
	// Read the actual button binding so an unwired handler cannot make this pass.
	const handler = source.match(
		new RegExp(`on:click=\\{([^}]+)\\}[^>]*>\\s*<i\\b[^>]*></i>\\s*${label}\\s*<`)
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
