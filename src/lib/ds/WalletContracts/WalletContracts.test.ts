import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canSignFor } from '$lib/chain/signerGate';
import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import WalletContracts from './WalletContracts.svelte';
import type { WalletContract } from '../../wallet/summary';

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
		props: { contracts, current: null, pageAddress: 'OWNER', selected: null, state: 'ready' }
	}).body;
	expect(html).toMatch(/<a\b[^>]*href="\/wallet\/ESCROW"/);
	const source = readFileSync(new URL('./WalletContracts.svelte', import.meta.url), 'utf8');
	expect(source).not.toMatch(/selectWallet\s*\(|selectedWallet\.set/);
});
it.each([
	['watch-only', { address: 'OWNER', app: 'Watch' }, 'OWNER', false],
	['connected owner', { address: 'OWNER', app: 'kibisis' }, 'OWNER', true],
	['different page', { address: 'OWNER', app: 'kibisis' }, 'OTHER', false],
	['contract page with owner selected', { address: 'OWNER', app: 'kibisis' }, 'ESCROW', false],
	['different selection', { address: 'OTHER', app: 'kibisis' }, 'OWNER', false]
] as const)(
	'%s: row menu visibility follows both ownership and page address',
	(_, selected, pageAddress, allowed) => {
		const html = render(WalletContracts, {
			props: { contracts, current: null, pageAddress, selected, state: 'ready' }
		}).body;
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

it('mixed ownership across two contracts suppresses every row action', () => {
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
			selected: { address: 'OWNER', app: 'kibisis' },
			state: 'ready'
		}
	}).body;
	expect(html).not.toContain('aria-haspopup="menu"');
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
				selected: { address: 'OWNER', app: 'kibisis' },
				state: condition === 'missing details' ? 'ready' : condition
			}
		}).body;
		expect(html).not.toContain('aria-haspopup="menu"');
	}
);

it.each([false, true])(
	'rechecks ownership after the modal import resolves (selection changed: %s)',
	async (changed) => {
		// Execute the component's actual async handler; replace only module loading with a deferred promise.
		const source = readFileSync(new URL('./WalletContracts.svelte', import.meta.url), 'utf8');
		const script = source.slice(source.indexOf('>') + 1, source.indexOf('</script>'));
		const ast = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true);
		const handler = ast.statements.find(
			(node) => ts.isFunctionDeclaration(node) && node.name?.text === 'open'
		);
		if (!handler) throw new Error('Missing open handler');
		const code = ts
			.transpile(handler.getText(ast), { target: ts.ScriptTarget.ES2022 })
			.replace(/import\('[^']+'\)/g, 'loadModal()');
		let resolve!: (value: { default: () => void }) => void;
		const pending = new Promise<{ default: () => void }>((done) => {
			resolve = done;
		});
		const context = {
			selected: { address: 'OWNER', app: 'kibisis' },
			pageAddress: 'OWNER',
			get canAct() {
				return canSignFor(this.selected, 'OWNER') && this.selected.address === this.pageAddress;
			},
			canSignFor,
			loadModal: vi.fn(() => pending),
			WithdrawModal: null,
			RegisterVoteKey: null,
			selectedContract: null,
			showWithdrawModal: false,
			showRegisterVoteKey: false,
			withdrawOpenGeneration: 0,
			actionError: ''
		};
		const open = runInNewContext(`${code}; open`, context);
		const opening = open(contracts[0], 'withdraw');
		expect(context.loadModal).toHaveBeenCalledOnce();
		expect(context.showWithdrawModal).toBe(false);
		if (changed) context.selected = { address: 'OTHER', app: 'kibisis' };
		resolve({ default: () => {} });
		await opening;
		expect(context.showWithdrawModal).toBe(!changed);
		expect(context.selectedContract).toBe(changed ? null : contracts[0].details);
	}
);
