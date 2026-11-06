import { readFileSync } from 'node:fs';
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
