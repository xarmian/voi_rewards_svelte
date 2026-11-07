import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');
const open = source.match(/\tasync function openSendVoiModal\([^]*?\n\t\}/)?.[0];
const modal = source.match(/<!-- Send VOI Modal -->\s*\{#if ([^]*?)\}([^]*?)\{\/if\}/);

test('opening Send VOI captures a loaded balance before opening', () => {
	expect(source, 'Keep a balance snapshot for the open Send VOI modal').toMatch(
		/let sendVoiBalance = 0;/
	);
	expect(open, 'Keep the Send VOI open handler').toBeDefined();
	expect(open, 'Do not open Send VOI with an unavailable balance').toMatch(
		/if \(accountPart\.status !== 'loaded'\) return;/
	);
	expect(open, 'Capture the loaded account balance').toContain(
		'sendVoiBalance = accountPart.value.balance;'
	);
	expect(
		open!.indexOf('sendVoiBalance ='),
		'Capture balance before opening the modal'
	).toBeLessThan(open!.indexOf('showSendVoiModal = true'));
});

test('an account refresh cannot unmount Send VOI or change its token balance', () => {
	expect(modal, 'Keep the Send VOI modal block').not.toBeNull();
	expect(modal![1], 'An open send must survive account loading').not.toContain('accountPart');
	expect(modal![1], 'Mount the send for an open wallet modal').toMatch(
		/typeof walletAddress === 'string' && showSendVoiModal/
	);
	expect(modal![2], 'Use the opening balance snapshot in the token prop').toMatch(
		/balance:\s*sendVoiBalance/
	);
});

test('the Send button remains disabled until the account is loaded', () => {
	expect(source, 'Block opening the modal while balance is unavailable').toMatch(
		/on:click=\{openSendVoiModal\}[^]*?disabled=\{accountPart\.status !== 'loaded'\}/
	);
});
