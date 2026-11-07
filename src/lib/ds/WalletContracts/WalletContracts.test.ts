import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { pageAccountState } from '$lib/chain/signerGate';
import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import WalletContracts from './WalletContracts.svelte';
import { sortRows } from '../DataTable/sort';
import type { WalletContract } from '../../wallet/summary';
import { contractFixture } from '../../wallet/contracts.fixtures';

vi.mock('$lib/component/WithdrawModal.svelte', () => ({ default: () => {} }));
vi.mock('$lib/component/RegisterVoteKey.svelte', () => ({ default: () => {} }));
const contracts = [
	{
		address: 'ESCROW',
		contractId: 36907,
		balance: 10000,
		isParticipating: true,
		round: 100,
		voteLastValid: null,
		lastVoteAt: null,
		lastBlock: null,
		details: {
			owner: 'OWNER',
			contractAddress: 'ESCROW',
			contractId: 36907,
			isParticipating: true,
			availableForWithdrawal: 1000000,
			nextVestingDate: null
		}
	}
] as WalletContract[];

it('TASK-164: every displayed contract address is a read-only wallet link', () => {
	const html = render(WalletContracts, {
		props: {
			contracts,
			current: null,
			pageAddress: 'OWNER',
			accountState: { state: 'read-only' },
			state: 'ready'
		}
	}).body.replace(/<!--[\s\S]*?-->/g, '');
	expect(html).toMatch(/<a\b[^>]*href="\/wallet\/ESCROW"/);
	const source = readFileSync(new URL('./WalletContracts.svelte', import.meta.url), 'utf8');
	expect(source).not.toMatch(/selectWallet\s*\(|selectedWallet\.set/);
});
it.each([
	['watch-only', { address: 'OWNER', app: 'Watch' }, 'OWNER', false],
	['connected owner', { address: 'OWNER', app: 'kibisis' }, 'OWNER', true],
	['different page', { address: 'OWNER', app: 'kibisis' }, 'OTHER', false],
	['contract page with owner connected', { address: 'OWNER', app: 'kibisis' }, 'ESCROW', false],
	['different connected account', { address: 'OTHER', app: 'kibisis' }, 'OWNER', false]
] as const)(
	'%s: row menu visibility follows both ownership and page address',
	(_, selected, pageAddress, allowed) => {
		const html = render(WalletContracts, {
			props: {
				contracts,
				current: null,
				pageAddress,
				accountState: pageAccountState(pageAddress, selected ? [selected] : []),
				state: 'ready'
			}
		}).body.replace(/<!--[\s\S]*?-->/g, '');
		expect(html.includes('aria-haspopup="menu"')).toBe(allowed);
	}
);

it('keeps the existing withdraw and key-registration modal props', () => {
	const source = readFileSync(new URL('./WalletContracts.svelte', import.meta.url), 'utf8');
	for (const prop of [
		'contract={selectedContract}',
		'walletAddress={selectedContract.contractAddress}',
		'parentWalletAddress={selectedContract.owner}',
		'contractId={selectedContract.contractId}',
		'isOnline={selectedContract.isParticipating}'
	])
		expect(source).toContain(prop);
	expect(source).not.toMatch(/captureSigner|signTransactions|signAndSendTransactions/);
});

it('mixed ownership keeps the authorized row menu and suppresses the foreign row menu', () => {
	const mixed = [
		contracts[0],
		{
			...contracts[0],
			address: 'OTHER_ESCROW',
			contractId: 36908,
			details: { ...contracts[0].details!, owner: 'OTHER' }
		}
	];
	const html = render(WalletContracts, {
		props: {
			contracts: mixed,
			current: null,
			pageAddress: 'OWNER',
			accountState: pageAccountState('OWNER', [{ address: 'OWNER', app: 'kibisis' }]),
			state: 'ready'
		}
	}).body.replace(/<!--[\s\S]*?-->/g, '');
	expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(1);
	expect(html).toContain('Actions for contract #36907');
	expect(html).not.toContain('Actions for contract #36908');
});
it.each(['loading', 'error', 'missing details'] as const)(
	'%s suppresses actions even for the connected owner',
	(condition) => {
		const html = render(WalletContracts, {
			props: {
				contracts:
					condition === 'missing details' ? [{ ...contracts[0], details: null }] : contracts,
				current: null,
				pageAddress: 'OWNER',
				accountState: pageAccountState('OWNER', [{ address: 'OWNER', app: 'kibisis' }]),
				state: condition === 'missing details' ? 'ready' : condition
			}
		}).body.replace(/<!--[\s\S]*?-->/g, '');
		expect(html).not.toContain('aria-haspopup="menu"');
	}
);

const source = readFileSync(new URL('./WalletContracts.svelte', import.meta.url), 'utf8');
const script = source.slice(source.indexOf('>') + 1, source.indexOf('</script>'));
const ast = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true);
function functionCode(name: string) {
	const handler = ast.statements.find(
		(node) => ts.isFunctionDeclaration(node) && node.name?.text === name
	);
	if (!handler) throw new Error(`Missing ${name} handler`);
	return ts
		.transpile(handler.getText(ast), { target: ts.ScriptTarget.ES2022 })
		.replace(/import\('[^']+'\)/g, 'loadModal()');
}
function harness() {
	const pending = Promise.withResolvers<{ default: () => void }>();
	const context = {
		contracts: [contractFixture(), contractFixture(2)],
		accountState: pageAccountState('OWNER', [{ address: 'OWNER', app: 'kibisis' }]),
		pageAddress: 'OWNER',
		dataState: 'ready',
		contractSet: 'ready',
		get canAct() {
			return (
				this.dataState !== 'loading' &&
				this.dataState !== 'error' &&
				this.contracts.length > 0 &&
				this.accountState.state === 'yours'
			);
		},
		pageAccountState,
		loadModal: vi.fn(() => pending.promise),
		WithdrawModal: null,
		RegisterVoteKey: null,
		selectedContract: null,
		showWithdrawModal: false,
		showRegisterVoteKey: false,
		withdrawOpenGeneration: 0,
		openContextGeneration: 0,
		actionError: '',
		onrefresh: vi.fn<() => Promise<void> | void>()
	};
	const optionalRowGate = ast.statements.some(
		(node) => ts.isFunctionDeclaration(node) && node.name?.text === 'rowCanAct'
	)
		? functionCode('rowCanAct')
		: '';
	const handlers = runInNewContext(
		`${optionalRowGate}; ${functionCode('open')}; ${functionCode('handleWithdrawSuccess')}; ({open, handleWithdrawSuccess})`,
		context
	);
	return { context, handlers, resolve: () => pending.resolve({ default: () => {} }) };
}
it.each(['overview', 'full'] as const)(
	'%s retains healthy row actions and the unreadable row, without an empty menu, and offers Refresh',
	(mode) => {
		const html = render(WalletContracts, {
			props: {
				contracts: [contractFixture(), { ...contractFixture(2), details: null }],
				current: null,
				pageAddress: 'OWNER',
				accountState: pageAccountState('OWNER', [{ address: 'OWNER', app: 'kibisis' }]),
				state: 'ready',
				mode,
				onrefresh: vi.fn()
			}
		}).body.replace(/<!--[\s\S]*?-->/g, '');
		expect(html).toContain('href="/wallet/CONTRACT2"');
		expect(html).toContain('1 of 2 contracts could not be loaded; totals are incomplete');
		expect(html).toMatch(/>Refresh<\/button>/);
		if (mode === 'overview') {
			expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(1);
			expect(html).toContain('Actions for contract #1');
			expect(html).not.toContain('Actions for contract #2');
		} else {
			expect(html).not.toContain('aria-haspopup="menu"');
			expect(html.match(/>Withdraw<\/button>/g)).toHaveLength(1);
		}
		expect(html).toContain('Withdrawable balance unavailable');
		expect(source).toMatch(/onclick=\{onrefresh\}/);
	}
);
it.each(['withdraw', 'key'] as const)(
	'the %s opener checks the clicked row before importing and passes the exact raw details',
	async (action) => {
		const { context, handlers, resolve } = harness();
		const raw = context.contracts[0].details;
		const foreign = contractFixture(3, { owner: 'OTHER' });
		const invalid = handlers.open(foreign, action);
		expect(context.loadModal).not.toHaveBeenCalled();
		await invalid;
		const opening = handlers.open(context.contracts[0], action);
		expect(context.selectedContract).toBeNull();
		resolve();
		await opening;
		expect(context.selectedContract).toBe(raw);
		expect(action === 'withdraw' ? context.showWithdrawModal : context.showRegisterVoteKey).toBe(
			true
		);
	}
);
it.each(['withdraw', 'key'] as const)(
	'the %s opener rejects changes during its import',
	async (action) => {
		for (const change of [
			'selection',
			'page',
			'both',
			'removed',
			'replaced details',
			'mutated details',
			'loading',
			'error'
		] as const) {
			const { context, handlers, resolve } = harness();
			const row = context.contracts[0];
			const opening = handlers.open(row, action);
			expect(context.loadModal, change).toHaveBeenCalledOnce();
			if (change === 'selection') context.accountState = pageAccountState('OWNER', []);
			if (change === 'page') context.pageAddress = 'OTHER';
			if (change === 'both') {
				context.pageAddress = 'OTHER';
				context.accountState = pageAccountState('OWNER', []);
			}
			if (change === 'removed') context.contracts = [context.contracts[1]];
			if (change === 'replaced details')
				context.contracts = [{ ...row, details: { ...row.details! } }, context.contracts[1]];
			if (change === 'mutated details') row.details = { ...row.details! };
			if (change === 'loading' || change === 'error') context.dataState = change;
			resolve();
			await opening;
			expect(context.selectedContract, change).toBeNull();
			expect(context.showWithdrawModal || context.showRegisterVoteKey, change).toBe(false);
		}
	}
);
it('sorting or expanding another row never retargets the opened raw contract', async () => {
	const { context, handlers, resolve } = harness();
	const raw = context.contracts[0].details;
	const pending = handlers.open(context.contracts[0], 'withdraw');
	resolve();
	await pending;
	context.contracts = sortRows(
		context.contracts,
		{ key: 'balance', header: 'Balance', priority: 1, sortValue: (r) => r.contractId },
		'desc'
	);
	const tableSource = readFileSync(
		new URL('../DataTable/DataTable.svelte', import.meta.url),
		'utf8'
	);
	const tableScript = tableSource.slice(
		tableSource.indexOf('>') + 1,
		tableSource.indexOf('</script>')
	);
	const tableAst = ts.createSourceFile('table.ts', tableScript, ts.ScriptTarget.Latest, true);
	const disclosure = tableAst.statements.find(
		(node) => ts.isFunctionDeclaration(node) && node.name?.text === 'toggleDetails'
	)!;
	const expanded = { ...context, expandedKeys: [] as string[], ondetails: vi.fn() };
	runInNewContext(
		`${ts.transpile(disclosure.getText(tableAst))}; toggleDetails(contracts[0], '2');`,
		expanded
	);
	expect(expanded.expandedKeys).toEqual(['2']);
	expect(expanded.selectedContract).toBe(raw);
	// Details are display snippets; no opener or modal lives in a detail snippet.
	expect(source.indexOf('<WithdrawModal')).toBeGreaterThan(source.indexOf('</Card>'));
	expect(source.indexOf('<RegisterVoteKey')).toBeGreaterThan(source.indexOf('</Card>'));
	expect(context.selectedContract).toBe(raw);
	expect(context.loadModal).toHaveBeenCalledOnce();
});
it('an old withdrawal success cannot clear a newly opened withdrawal after refresh', async () => {
	const { context, handlers, resolve } = harness();
	let pending = handlers.open(context.contracts[0], 'withdraw');
	resolve();
	await pending;
	const refresh = Promise.withResolvers<void>();
	context.onrefresh.mockReturnValue(refresh.promise);
	const success = handlers.handleWithdrawSuccess(true);
	pending = handlers.open(context.contracts[1], 'withdraw');
	await pending;
	const raw = context.contracts[1].details;
	refresh.resolve();
	await success;
	expect(context.selectedContract).toBe(raw);
});
it('full mode shows every row initially closed with native disclosure and sort buttons, unavailable details, and no overflow wrapper', () => {
	const rows = Array.from({ length: 16 }, (_, n) => ({
		...contractFixture(n + 1),
		isParticipating: n === 15
	}));
	rows[3].details = null;
	const html = render(WalletContracts, {
		props: {
			contracts: rows,
			current: null,
			pageAddress: 'OWNER',
			accountState: { state: 'read-only' },
			state: 'ready',
			mode: 'full'
		}
	}).body.replace(/<!--[\s\S]*?-->/g, '');
	expect(html.match(/Details for contract #/g)).toHaveLength(16);
	expect(html.match(/aria-expanded="false"/g)).toHaveLength(16);
	expect(html).not.toContain('aria-haspopup="menu"');
	expect(html).not.toContain('Show 9 more');
	for (const header of [
		'Status',
		'Balance',
		'Locked',
		'Withdrawable',
		'Next unlock',
		'Key expires'
	])
		expect(html).toMatch(new RegExp(`<button[^>]*>${header}`));
	expect(html.indexOf('href="/wallet/CONTRACT16"')).toBeLessThan(
		html.indexOf('href="/wallet/CONTRACT1"')
	);
	expect(html).toContain('Unavailable');
	expect(source).not.toMatch(/overflow-x|min-w-(?!0)/);
});
it('full mode sort scalars use status, VOI balances, UTC timestamps, and expiry days with unknown values last', () => {
	const statement = ast.statements.find(
		(node) =>
			ts.isVariableStatement(node) &&
			node.declarationList.declarations.some((d) => d.name.getText(ast) === 'fullColumns')
	);
	expect(statement, 'full column definitions').toBeDefined();
	const code = ts.transpile(statement!.getText(ast), { target: ts.ScriptTarget.ES2022 });
	const definitions = runInNewContext(`${code}; fullColumns`, {
		$derived: (x: unknown) => x,
		addressCell: null,
		statusCell: null,
		balanceCell: null,
		lockedCell: null,
		availableCell: null,
		keyCell: null,
		unlockCell: null
	});
	const row = contractFixture();
	row.voteLastValid = row.round + 86400 / 2.8;
	const values = Object.fromEntries(
		definitions.map((c: { key: string; sortValue: (r: WalletContract) => unknown }) => [
			c.key,
			c.sortValue(row)
		])
	);
	expect(values).toMatchObject({
		status: 0,
		balance: 12,
		locked: 8,
		available: 3.9,
		next: row.details!.nextVestingDate!.getTime(),
		key: 1
	});
});

it.each([
	['watch', { address: 'OWNER', app: 'Watch' }, 'OWNER', 'ready'],
	['another selection', { address: 'OTHER', app: 'kibisis' }, 'OWNER', 'ready'],
	['another page', { address: 'OWNER', app: 'kibisis' }, 'OTHER', 'ready'],
	['child page', { address: 'OWNER', app: 'kibisis' }, 'CONTRACT1', 'ready'],
	['loading', { address: 'OWNER', app: 'kibisis' }, 'OWNER', 'loading'],
	['failed list', { address: 'OWNER', app: 'kibisis' }, 'OWNER', 'error']
] as const)('full mode has no action for %s', (_, selected, pageAddress, state) => {
	const html = render(WalletContracts, {
		props: {
			contracts: [contractFixture()],
			current: null,
			pageAddress,
			accountState: pageAccountState(pageAddress, selected ? [selected] : []),
			state,
			mode: 'full'
		}
	}).body.replace(/<!--[\s\S]*?-->/g, '');
	expect(html).not.toMatch(/>Withdraw<\/button>|>Register participation key<\/button>/);
	expect(html).not.toContain('aria-haspopup="menu"');
});

it.each(['overview', 'full'] as const)(
	'%s never offers actions from an unavailable source list, including retained stale rows',
	(mode) => {
		const html = render(WalletContracts, {
			props: {
				contracts: [contractFixture()],
				current: null,
				pageAddress: 'OWNER',
				accountState: pageAccountState('OWNER', [{ address: 'OWNER', app: 'kibisis' }]),
				state: 'stale',
				contractSet: 'unavailable',
				mode
			}
		}).body.replace(/<!--[\s\S]*?-->/g, '');
		expect(html).toContain('href="/wallet/CONTRACT1"');
		expect(html).not.toContain('aria-haspopup="menu"');
		expect(html).not.toMatch(/>Withdraw<\/button>/);
	}
);

it('a refresh that finishes during import still invalidates the pending opener', async () => {
	const effect = ast.statements.find(
		(node) =>
			ts.isExpressionStatement(node) &&
			ts.isCallExpression(node.expression) &&
			node.expression.expression.getText(ast) === '$effect.pre'
	);
	expect(effect, 'track opener context changes before rendering').toBeDefined();
	const { context, handlers, resolve } = harness();
	const reactive = Object.assign(context, {
		$effect: { pre: (callback: () => void) => callback() }
	});
	// Execute the actual component effect for both observable loading-state changes.
	const effectCode = ts.transpile(effect!.getText(ast), { target: ts.ScriptTarget.ES2022 });
	const row = context.contracts[0];
	const pending = handlers.open(row, 'withdraw');
	context.dataState = 'loading';
	runInNewContext(effectCode, reactive);
	context.dataState = 'stale';
	runInNewContext(effectCode, reactive);
	resolve();
	await pending;
	expect(context.selectedContract).toBeNull();
});

it('invalid schedule dates stay unavailable without aborting the contract rows', () => {
	let html = '';
	expect(() => {
		html = render(WalletContracts, {
			props: {
				contracts: [contractFixture(1, { nextVestingDate: new Date(NaN) })],
				current: null,
				pageAddress: 'OWNER',
				accountState: { state: 'read-only' },
				state: 'ready',
				mode: 'full'
			}
		}).body;
	}).not.toThrow();
	expect(html).toContain('Unavailable');
	expect(html).toContain('href="/wallet/CONTRACT1"');
});
it('small positive withdrawable and scheduled amounts do not round to zero', () => {
	const html = render(WalletContracts, {
		props: {
			contracts: [contractFixture(1, { availableForWithdrawal: 1, nextVestingAmount: 1 })],
			current: null,
			pageAddress: 'OWNER',
			accountState: { state: 'read-only' },
			state: 'ready',
			mode: 'full'
		}
	}).body.replace(/<!--[\s\S]*?-->/g, '');
	expect(html).toContain('&lt;0.01 VOI withdrawable now');
	expect(html).toContain('+&lt;0.01 VOI');
});

it('does not show a withdrawable total while the contract list is unavailable', () => {
	const html = render(WalletContracts, {
		props: {
			contracts: [contractFixture(1)],
			current: null,
			pageAddress: 'OWNER',
			accountState: { state: 'read-only' },
			state: 'stale',
			contractSet: 'unavailable'
		}
	}).body;
	expect(html).toContain('Withdrawable balance unavailable');
	expect(html).not.toContain('VOI withdrawable now');
});
