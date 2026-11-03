import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import algosdk from 'algosdk';
import ts from 'typescript';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./BridgeModal.svelte', import.meta.url), 'utf8');
const fn = (name: string) =>
	source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';
const derivation = source.match(/\$:\s*destinationAddress\s*=\s*([^;]+);/)?.[1] ?? '';

test('keeps input text separate from a single derived receiver', () => {
	expect(source).not.toMatch(/algorandDestinationAddress|voiDestinationAddress/);
	for (const state of ['algorandDestination', 'voiDestination']) {
		expect(source).toContain(`bind:value={${state}.text}`);
	}
	expect(source).not.toMatch(/bind:value=\{\w*DestinationAddress\}/);
	expect(derivation).toMatch(
		/\(isVoiToAlgorand\s*\?\s*algorandDestination\s*:\s*voiDestination\)\.address\s*\?\?\s*''/
	);
	expect(source).toMatch(/\$:\s*isValidDestination = Boolean\(destinationAddress\)/);
	expect(fn('handleInput')).toContain('editDestination(');
	expect(fn('handleInput')).toContain('unresolvedName(');
});
test('uses that receiver for submit, both notes, QR expectations and opt-in', () => {
	const submit = fn('handleSubmit');
	expect(submit).toMatch(/if\s*\([^)]*!algosdk\.isValidAddress\(destinationAddress\)[^]*?return/);
	expect(submit).toContain('const destination = destinationAddress;');
	expect(
		submit.match(/\bdestinationAddress\s*[,\n]/g),
		'Both bridge notes use the receiver'
	).toHaveLength(2);
	const start = fn('startQrMonitoring');
	expect(start).toMatch(/JSON.stringify\(\[[^]*?\bdestinationAddress\b[^]*?\]\)/);
	expect(
		start.match(/\bdestinationAddress\s*[,\n]/g),
		'QR key and both expectations share receiver'
	).toHaveLength(3);
	expect(fn('startBridgeMonitoring')).toMatch(
		/bridgeAddress: BRIDGE_ADDRESS,\s*destinationAddress,/
	);
	expect(source).toContain('checkOptIn(destinationAddress)');
});
test('shows the transaction receiver under each input and in the pre-sign summary', () => {
	for (const state of ['algorandDestination', 'voiDestination']) {
		expect(source).toMatch(new RegExp(`<ResolvedAddress\\s+address=\\{${state}\\.address\\}`));
		expect(source).toContain(`{${state}.error}`);
	}
	const summary = source.slice(
		source.indexOf('Bridge fee:'),
		source.indexOf('<!-- QR Code Modal -->')
	);
	expect(summary).toContain('To:');
	expect(summary).toMatch(/<ResolvedAddress\s+address=\{destinationAddress\}/);
	// The summary identifier must be identical to the submit receiver identifier.
	const receiver = fn('handleSubmit').match(/const destination = (\w+);/)?.[1];
	expect(summary).toContain(`address={${receiver}}`);
});
test('resets both destinations on direction change, reset, close and back', () => {
	const direction = source.match(/\$:\s*if \(selectedDirection\) \{([^]*?)\n\t\}/)?.[1] ?? '';
	for (const body of [direction, fn('resetBridgeState'), fn('closeModal'), fn('goBack')]) {
		for (const state of ['algorandDestination', 'voiDestination']) {
			expect(body).toMatch(new RegExp(`${state} = \\{ \\.\\.\\.emptyDestination \\}`));
		}
	}
});
test('picking an NFD makes the screen and bridge receiver agree', async () => {
	const { selectDestinationName, emptyDestination } = await import('../chain/destinationSelection');
	const address = algosdk.encodeAddress(new Uint8Array(32));
	const context = createContext({
		algorandDestination: { ...emptyDestination, text: 'typed query' },
		voiDestination: emptyDestination,
		isVoiToAlgorand: true,
		destinationAddress: '',
		selectDestinationName,
		algosdk,
		resolvedName: null,
		showSearchResults: true,
		getAvatarUrl: () => null,
		nfdRules: { kind: 'nfd', isValidAddress: algosdk.isValidAddress },
		envoiRules: { kind: 'envoi', isValidAddress: algosdk.isValidAddress },
		result: { name: 'chosen.algo', owner: address }
	});
	runInContext(ts.transpileModule(fn('selectSearchResult'), {}).outputText, context);
	runInContext(`selectSearchResult(result); destinationAddress = ${derivation}`, context);
	expect(runInContext('destinationAddress', context)).toBe(address);
	expect(runInContext('algorandDestination.text', context)).toBe('chosen.algo');
	expect(runInContext('algorandDestination.text', context)).not.toBe('typed query');
});
