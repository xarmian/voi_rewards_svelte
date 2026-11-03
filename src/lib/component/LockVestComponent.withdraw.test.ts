import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('./LockVestComponent.svelte', import.meta.url), 'utf8');

function handlers() {
	const script = source.split('<script lang="ts">')[1].split('</script>')[0];
	const parsed = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true);
	const functions = parsed.statements
		.filter(
			(node) =>
				ts.isFunctionDeclaration(node) &&
				['handleWithdrawClick', 'handleWithdrawSuccess'].includes(node.name?.text ?? '')
		)
		.map((node) => node.getText(parsed))
		.join('\n');
	// Extract the actual declarations too: the generation starts with component state.
	const declarations = parsed.statements
		.filter(
			(node) =>
				ts.isVariableStatement(node) &&
				node.declarationList.declarations.some((d) =>
					['selectedContract', 'showWithdrawModal', 'withdrawOpenGeneration'].includes(
						d.name.getText(parsed)
					)
				)
		)
		.map((node) => node.getText(parsed))
		.join('\n');
	const pending = Promise.withResolvers<void>();
	const loadContractDetails = vi.fn(() => pending.promise);
	const context = createContext({ loadContractDetails });
	runInContext(
		ts.transpileModule(`${declarations}\n${functions}`, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	const run = (code: string) => runInContext(code, context);
	run('handleWithdrawClick({ contractId: 1 }); showWithdrawModal = false;');
	return { run, pending, loadContractDetails };
}

test.each([2, 1])(
	'a refresh from closing A preserves contract %s opened during the refresh',
	async (contractId) => {
		const { run, pending, loadContractDetails } = handlers();
		const refresh = run('handleWithdrawSuccess(true)');
		expect(loadContractDetails).toHaveBeenCalledOnce();
		run(`handleWithdrawClick({ contractId: ${contractId} })`);
		pending.resolve();
		await refresh;
		expect(run('selectedContract?.contractId')).toBe(contractId);
		expect(run('showWithdrawModal')).toBe(true);
	}
);

test('a refresh clears the selection when nothing else was opened', async () => {
	const { run, pending } = handlers();
	const refresh = run('handleWithdrawSuccess(true)');
	expect(run('selectedContract.contractId')).toBe(1);
	pending.resolve();
	await refresh;
	expect(run('selectedContract')).toBeNull();
	expect(run('showWithdrawModal')).toBe(false);
});

test('closing without refresh clears synchronously and does not erase a later open', async () => {
	const { run, loadContractDetails } = handlers();
	const closed = run('handleWithdrawSuccess(false)');
	expect(run('selectedContract')).toBeNull();
	expect(loadContractDetails).not.toHaveBeenCalled();
	run('handleWithdrawClick({ contractId: 2 })');
	await closed;
	expect(run('selectedContract.contractId')).toBe(2);
	expect(run('showWithdrawModal')).toBe(true);
});
