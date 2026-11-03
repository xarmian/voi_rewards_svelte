import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import algosdk from 'algosdk';
import ts from 'typescript';
import { expect, test } from 'vitest';
import { selectDestinationName, emptyDestination } from '../chain/destinationSelection';
import { nfdReceiveAddress } from '../utils/nfd';

const source = readFileSync(new URL('./BridgeModal.svelte', import.meta.url), 'utf8');
const fn = (name: string) =>
	source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';
const derivation = source.match(/\$:\s*destinationAddress\s*=\s*([^;]+);/)?.[1] ?? '';
const owner = algosdk.generateAccount().addr.toString();
const deposit = algosdk.generateAccount().addr.toString();

function pick(result: Record<string, unknown>) {
	const context = createContext({
		algorandDestination: { ...emptyDestination, text: 'typed query' },
		voiDestination: emptyDestination,
		isVoiToAlgorand: true,
		destinationAddress: '',
		selectDestinationName,
		nfdReceiveAddress,
		algosdk,
		resolvedName: null,
		showSearchResults: true,
		getAvatarUrl: () => null,
		nfdRules: { kind: 'nfd', isValidAddress: algosdk.isValidAddress },
		envoiRules: { kind: 'envoi', isValidAddress: algosdk.isValidAddress },
		result
	});
	runInContext(ts.transpileModule(fn('selectSearchResult'), {}).outputText, context);
	runInContext(`selectSearchResult(result); destinationAddress = ${derivation}`, context);
	return {
		sent: runInContext('destinationAddress', context) as string,
		shown: runInContext('algorandDestination.address', context) as string | null,
		resolved: runInContext('resolvedName', context) as { address: string } | null
	};
}

test('picking an NFD whose depositAccount differs from its owner sends to and shows the depositAccount', () => {
	const picked = pick({ name: 'chosen.algo', owner, depositAccount: deposit });
	expect(picked.sent).toBe(deposit);
	expect(picked.shown).toBe(deposit);
	expect(picked.resolved?.address).toBe(deposit);
});

test('picking an NFD with an empty depositAccount falls back to the owner', () => {
	const picked = pick({ name: 'chosen.algo', owner, depositAccount: '' });
	expect(picked.sent).toBe(owner);
	expect(picked.shown).toBe(owner);
});

test('an NFD with no usable address cannot be used', () => {
	const picked = pick({ name: 'broken.algo', owner: 'x', depositAccount: 'y' });
	expect(picked.sent).toBe('');
	expect(picked.shown).toBeNull();
});

test('a typed address is sent as typed and a reverse-resolved name only labels it', () => {
	const input = fn('handleInput');
	expect(input).not.toContain('nfdReceiveAddress');
	expect(input).not.toContain('depositAccount');
	expect(input).not.toMatch(/\.address = /);
	// The reverse lookup writes the name onto the state that already holds the typed address.
	expect(input).toContain('algorandDestination = { ...state, name: resolvedName.name };');
	expect(input).toContain('address: input,');
});

test('the bridge destination resolves an NFD only through the shared helper', () => {
	const pickFn = fn('selectSearchResult');
	expect(pickFn).toContain('nfdReceiveAddress(result)');
	expect(pickFn).not.toMatch(/result\.owner/);
});

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return files(path);
		return /\.(ts|svelte)$/.test(path) && !/\.test\.ts$/.test(path) ? [path] : [];
	});
}

test('population: BridgeModal is the only input that takes an NFD search result as a recipient', () => {
	const root = fileURLToPath(new URL('../../', import.meta.url));
	const users = files(root)
		.filter((path) => /\bsearchNFDomains\b/.test(readFileSync(path, 'utf8')))
		.map((path) => path.slice(root.length))
		.sort();
	expect(users).toEqual(['lib/component/BridgeModal.svelte', 'lib/utils/nfd.ts']);
});
