import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./ManageApprovalsModal.svelte', import.meta.url), 'utf8');

test('clears the selected spender on edit and displays its full address', () => {
	expect(source).toMatch(/onEdit=\{\(\) => \(spenderAddress = ''\)\}/);
	expect(source).toMatch(/<ResolvedAddress\s+address=\{spenderAddress\}\s+name=\{spenderText\}/);
	expect(source).toMatch(/bind:searchText=\{spenderText\}/);
});
test('requires a valid spender before enabling approval', () => {
	const button = source.match(/<button\s+on:click=\{handleCreateApproval\}([^]*?)>/)?.[1];
	expect(button).toMatch(/disabled=\{[^}]*!algosdk\.isValidAddress\(spenderAddress\)/);
	expect(source).toMatch(/arc200Approve\(\s*Number\(token.id\),\s*spenderAddress,/);
});
