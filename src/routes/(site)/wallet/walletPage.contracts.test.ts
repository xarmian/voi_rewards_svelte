import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
const source = readFileSync('src/routes/(site)/wallet/[...id]/+page.svelte', 'utf8');
const script = source.slice(source.indexOf('>') + 1, source.indexOf('</script>'));
const ast = ts.createSourceFile('page.ts', script, ts.ScriptTarget.Latest, true);
function code(name: string) {
	const statement = ast.statements.find((s) =>
		ts.isFunctionDeclaration(s)
			? s.name?.text === name
			: ts.isVariableStatement(s) &&
				s.declarationList.declarations.some((d) => d.name.getText(ast) === name)
	);
	if (!statement) throw new Error(`Missing ${name}`);
	return ts.transpile(statement.getText(ast), { target: ts.ScriptTarget.ES2022 });
}
function harness() {
	const context = {
		browser: true,
		walletId: 'PAGE',
		parentWalletId: null as string | null,
		ownerLookup: 'ok',
		contractsSequence: 0,
		contractsSnapshot: null as unknown,
		contractsLoadedAddress: '',
		contractsLoadedOwner: '',
		contractsLoadState: 'loading',
		contractsRefreshFailed: false,
		loadContracts: vi.fn(),
		console: { error: vi.fn() }
	};
	const load = runInNewContext(`${code('updateContracts')}; updateContracts`, context);
	return { context, load };
}
it('publishes only the latest contract request for the same page and owner', async () => {
	const { context, load } = harness();
	const first = Promise.withResolvers<unknown>();
	const second = Promise.withResolvers<unknown>();
	context.loadContracts.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
	const a = load();
	context.parentWalletId = 'NEW_OWNER';
	const b = load();
	const fresh = { contracts: [], contractSet: 'ready' };
	second.resolve(fresh);
	await b;
	first.resolve({ contracts: [{ address: 'OLD' }], contractSet: 'ready' });
	await a;
	expect(context.contractsSnapshot).toBe(fresh);
	expect(context.contractsLoadedOwner).toBe('NEW_OWNER');
});
it('failed refresh keeps the last good contracts only for the same page and owner', async () => {
	const { context, load } = harness();
	const good = { contracts: [{ address: 'CHILD' }], contractSet: 'ready' };
	context.loadContracts.mockResolvedValueOnce(good);
	await load();
	context.loadContracts.mockRejectedValue(new Error('failed'));
	await load(true);
	expect(context.contractsSnapshot).toBe(good);
	expect(context.contractsLoadState).toBe('stale');
	expect(context.contractsRefreshFailed).toBe(true);
	context.walletId = 'OTHER';
	await load();
	expect(context.contractsSnapshot).toBeNull();
	expect(context.contractsLoadState).toBe('error');
});
it('independent contracts requests publish before any price or historical reward request', async () => {
	const { context, load } = harness();
	context.loadContracts.mockResolvedValue({ contracts: [], contractSet: 'ready' });
	await load();
	expect(context.contractsLoadState).toBe('ready');
	expect(code('updateContracts')).not.toMatch(/loadWallet|fetchVoiPrice|history|tokens/);
});
it('the Holdings snapshot carries both the loaded owner and the owner lookup state', () => {
	const split = source.match(/holdingsSplit=\{([\s\S]*?)\n\s*\/>/)?.[1] ?? '';
	expect(split).toContain('ownerAddress: loadedOwner');
	expect(split).toContain('ownerLookup');
	expect(source).toContain('loadedOwner !== address');
});

it('a failed list refresh preserves same-page rows for display while marking their source unavailable', async () => {
	const { context, load } = harness();
	const good = { contracts: [{ address: 'CHILD' }], contractSet: 'ready' };
	context.loadContracts.mockResolvedValueOnce(good);
	await load();
	context.loadContracts.mockResolvedValueOnce({ contracts: [], contractSet: 'unavailable' });
	await load(true);
	expect(context.contractsSnapshot).toMatchObject({
		contracts: good.contracts,
		contractSet: 'unavailable'
	});
	expect(context.contractsLoadState).toBe('stale');
	expect(context.contractsRefreshFailed).toBe(true);
});

it('refresh retries the server ownership source before treating the route as an ordinary account', async () => {
	const context = {
		browser: true,
		walletId: 'PAGE',
		parentWalletId: null,
		ownerLookup: 'unavailable',
		invalidate: vi.fn().mockResolvedValue(undefined),
		updateAccountInfo: vi.fn().mockResolvedValue(undefined)
	};
	const refresh = runInNewContext(`${code('refresh')}; refresh`, context);
	await refresh();
	expect(context.invalidate).toHaveBeenCalledExactlyOnceWith('wallet:id');
	expect(context.updateAccountInfo).not.toHaveBeenCalled();
	context.ownerLookup = 'ok';
	await refresh();
	expect(context.updateAccountInfo).toHaveBeenCalledExactlyOnceWith('PAGE', true);
});
