import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./BridgeModal.svelte', import.meta.url), 'utf8');
const states = ['algorandDestination', 'voiDestination'];

test('the full address is shown once under a picked name, without the name', () => {
	expect(source.match(/<ResolvedAddress/g)).toHaveLength(2);
	expect(source).not.toMatch(/<ResolvedAddress[^>]*\bname=/);
	for (const state of states) {
		expect(source).toMatch(
			new RegExp(
				`\\{#if pickedName\\(${state}\\) && ${state}\\.address\\}\\s*<ResolvedAddress\\s+address=\\{${state}\\.address\\}`
			)
		);
	}
});

test('the avatar sits with the name inside the input and is not repeated under it', () => {
	for (const state of states) {
		expect(source).toMatch(
			new RegExp(
				`\\{#if pickedName\\(${state}\\)\\}\\s*<span[^>]*>\\s*<NameAvatar[^>]*name=\\{${state}\\.name \\?\\? ''\\}`
			)
		);
	}
	expect(source.match(/<NameAvatar/g)).toHaveLength(4);
});

test('a typed address gets one row with the avatar and name, and never when a name was picked', () => {
	const rows = source.match(/\{#if resolvedName && [^}]*\}/g) ?? [];
	expect(rows).toHaveLength(2);
	for (const [index, state] of states.entries()) {
		expect(rows[index]).toContain(`!pickedName(${state})`);
	}
	expect(source.match(/>\s*\{resolvedName\.name\}\s*</g)).toHaveLength(2);
});

test('the pre-sign summary shows the receiver address once and no name', () => {
	const summary = source.slice(
		source.indexOf('Bridge fee:'),
		source.indexOf('<!-- QR Code Modal -->')
	);
	expect(summary).toContain('To:');
	expect(summary).toMatch(/data-testid="bridge-to-address"[^>]*>\{destinationAddress\}</);
	expect(summary).not.toContain('<ResolvedAddress');
	expect(summary).not.toMatch(/\.name\b/);
});
