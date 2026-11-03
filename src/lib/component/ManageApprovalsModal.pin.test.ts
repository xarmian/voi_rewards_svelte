import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./ManageApprovalsModal.svelte', import.meta.url), 'utf8');
const expression = source.match(/\$:\s*canSignTransactions\s*=([^;]+);/)?.[1] ?? '';

test.each([
	[true, null],
	[false, 'revoke-id']
])(
	'keeps signing capability during approve=%s revoke=%s after a selection switch',
	(isApproving, isRevoking) => {
		const context = createContext({
			signingPinned: true,
			isApproving,
			isRevoking,
			walletId: 'A',
			$selectedWallet: { address: 'B', app: 'Watch' }
		});
		expect(runInContext(ts.transpileModule(`Boolean(${expression})`, {}).outputText, context)).toBe(
			true
		);
		context.isApproving = false;
		context.isRevoking = null;
		expect(runInContext(ts.transpileModule(`Boolean(${expression})`, {}).outputText, context)).toBe(
			false
		);
	}
);

test.each(['handleCreateApproval', 'handleRevokeApproval'])(
	'%s captures capability at click and clears it after send',
	(name) => {
		const body = source.match(new RegExp(`async function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';
		expect(body.indexOf('signingPinned = canSignTransactions')).toBeGreaterThanOrEqual(0);
		expect(body.indexOf('signingPinned = canSignTransactions')).toBeLessThan(
			body.indexOf('await ')
		);
		expect(body).toMatch(/finally\s*\{[^}]*signingPinned = false/);
	}
);
