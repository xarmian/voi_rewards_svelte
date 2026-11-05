import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./LockContract.svelte', import.meta.url), 'utf8');

test.each(['handleWithdrawClick', 'handleRegisterVoteKey'])(
	'%s is disabled for a connected non-owner and explains why',
	(handler) => {
		const button = source.match(
			new RegExp(`<button\\s+on:click=\\{\\(\\) => ${handler}\\(contract\\)\\}[^]*?</button>`)
		)?.[0];
		expect(button).toBeDefined();
		expect(button).toMatch(
			/^\s*disabled=\{isWatchAccount \|\| !canSignFor\(\$selectedWallet, contract.owner\)\}$/m
		);
		expect(button).toMatch(
			/title=\{!isWatchAccount && !canSignFor\(\$selectedWallet, contract.owner\)\s*\? 'Connect the account that owns this contract\.'\s*: undefined\}/
		);
		const afterButton = source.slice(source.indexOf(button!) + button!.length);
		expect(afterButton).toMatch(
			/^\s*\{#if !isWatchAccount && !canSignFor\(\$selectedWallet, contract.owner\)\}\s*<p[^>]*>\s*Connect the account that owns this contract\.\s*<\/p>\s*\{\/if\}/
		);
	}
);
