import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('./LockVestComponent.svelte', import.meta.url), 'utf8');

const A = { contractId: 1, address: 'A', isParticipating: false, balance: 0 };
const B = { contractId: 2, address: 'B', isParticipating: false, balance: 0 };
const appInfo = { params: { 'global-state': [] } };

// Runs the component script with its imports stubbed. Each getApplicationByID read is held until the test
// settles it, so the test controls the order in which reloads finish.
function componentScript() {
	const reads: { id: number; read: PromiseWithResolvers<typeof appInfo> }[] = [];
	const script = source
		.split('<script lang="ts">')[1]
		.split('</script>')[0]
		.replace(/^\s*import .*;$/gm, '')
		.replace(/export let /g, 'let ');
	const context = createContext({
		A,
		B,
		browser: true,
		console: { error: vi.fn() },
		Math,
		Date,
		Number,
		Promise,
		algodClient: {
			getApplicationByID: (id: number) => ({
				do: () => {
					const read = Promise.withResolvers<typeof appInfo>();
					reads.push({ id, read });
					return read.promise;
				}
			})
		},
		requireAccountInfo: async () => ({ amount: 5_000_000, status: 'Offline', 'min-balance': 0 }),
		getConsensusInfo: async () => ({}),
		decodeLockContractState: () => ({ global_owner: 'OWNER' })
	});
	runInContext(
		ts.transpileModule(script, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	return { run: (code: string) => runInContext(code, context), reads };
}

test('a reload that finishes after a newer one does not overwrite the contract list', async () => {
	const { run, reads } = componentScript();
	// The wallet page grew childAccounts one contract at a time; each growth started a reload.
	const older = run('childAccounts = [A]; loadContractDetails()');
	const newer = run('childAccounts = [A, B]; loadContractDetails()');
	expect(reads.map((r) => r.id)).toEqual([1, 1, 2]);
	reads[1].read.resolve(appInfo);
	reads[2].read.resolve(appInfo);
	await newer;
	reads[0].read.resolve(appInfo);
	await older;
	expect(run('contracts.map((c) => c.contractId)')).toEqual([1, 2]);
	expect(run('isLoading')).toBe(false);
});

test('a contract whose read fails is counted, not dropped silently', async () => {
	const { run, reads } = componentScript();
	const load = run('childAccounts = [A, B]; loadContractDetails()');
	reads[0].read.reject(new Error('algod 429'));
	reads[1].read.resolve(appInfo);
	await load;
	expect(run('contracts.map((c) => c.contractId)')).toEqual([2]);
	expect(run('failedCount')).toBe(1);
	// The page names the failure next to the totals.
	expect(source).toMatch(
		/\{#if failedCount > 0\}[^]*?contracts could not be loaded; the totals[^]*?exclude them/
	);
});

test('when every read fails the page does not say there are no contracts', async () => {
	const { run, reads } = componentScript();
	const load = run('childAccounts = [A, B]; loadContractDetails()');
	reads[0].read.reject(new Error('algod 429'));
	reads[1].read.reject(new Error('algod 429'));
	await load;
	expect(run('contracts.length')).toBe(0);
	expect(run('failedCount')).toBe(2);
	// The all-failed branch comes before the empty-state branch.
	const failed = source.indexOf('{:else if contracts.length === 0 && failedCount > 0}');
	const empty = source.indexOf('{:else if contracts.length === 0}');
	expect(failed).toBeGreaterThan(0);
	expect(failed).toBeLessThan(empty);
});
