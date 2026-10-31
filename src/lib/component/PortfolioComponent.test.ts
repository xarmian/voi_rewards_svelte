import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');

function componentScript(loadComponent: (path: string) => Promise<unknown>) {
	const script = source
		.split('<script lang="ts">')[1]
		.split('</script>')[0]
		.replace(/^\s*import .*;$/gm, '')
		.replace(/export let /g, 'let ');
	const error = vi.fn();
	const context = createContext({
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

for (const [label, component, state] of [
	['Send', 'SendTokenModal', 'showSendVoiModal'],
	['Bridge', 'BridgeModal', 'showBridgeModal'],
	['History', 'TokenTransfersModal', 'showVoiTransfersModal']
]) {
	// Read the actual button binding so an unwired handler cannot make this pass.
	const handler = source.match(
		new RegExp(`on:click=\\{([^}]+)\\}[^>]*>\\s*<i\\b[^>]*></i>\\s*${label}\\s*<`)
	)?.[1];

	test(`${label} loads only on opening and reuses the component on the second open`, async () => {
		const pending = Promise.withResolvers<{ default: object }>();
		const load = vi.fn(() => pending.promise);
		const { run } = componentScript(load);
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
		await run(`(${handler})()`);
		expect(run(state)).toBe(false);
		expect(error).toHaveBeenCalledWith(expect.any(String), failure);
		await run(`(${handler})()`);
		expect(load).toHaveBeenCalledTimes(2);
		expect(run(state)).toBe(true);
	});
}
