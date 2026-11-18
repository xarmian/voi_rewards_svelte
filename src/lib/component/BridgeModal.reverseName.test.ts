import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import algosdk from 'algosdk';
import ts from 'typescript';
import { expect, test } from 'vitest';
import { editDestination, emptyDestination, unresolvedName } from '../chain/destinationSelection';
import { exactNFD } from '../utils/nfd';

const source = readFileSync(new URL('./BridgeModal.svelte', import.meta.url), 'utf8');
const fn = (name: string) =>
	source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';

const typed = algosdk.generateAccount().addr.toString();
const other = algosdk.generateAccount().addr.toString();
const reverseName = 'alice.algo';
// A prefix search whose first hit is a different NFD than the one the address reverse-resolves to.
const searchHits = [
	{ name: 'alice.algo.x', owner: other, depositAccount: other, avatar: 'wrong.png' },
	{ name: 'Alice.algo', owner: other, depositAccount: other, avatar: 'right.png' }
];

function context(hits: typeof searchHits) {
	return createContext({
		algosdk,
		editDestination,
		emptyDestination,
		unresolvedName,
		exactNFD,
		isVoiToAlgorand: true,
		algorandDestination: emptyDestination,
		voiDestination: emptyDestination,
		nfdRules: { kind: 'nfd', isValidAddress: algosdk.isValidAddress },
		envoiRules: { kind: 'envoi', isValidAddress: algosdk.isValidAddress },
		resolvedName: null,
		algorandSourceAddress: '',
		algorandSourceResolvedName: null,
		algorandSourceBalance: null,
		isValidSourceAddress: false,
		showSourceSearchResults: false,
		sourceSearchResults: [],
		searchResults: [],
		showSearchResults: false,
		selectedSearchIndex: -1,
		isSearching: false,
		searchTimeout: null,
		console,
		getNFD: async (addresses: string[]) =>
			addresses.map((key) => ({ key, replacementValue: reverseName })),
		searchNFDomains: async () => hits,
		getEnvoiNames: async () => [],
		checkAlgorandBalance: async () => {},
		getAvatarUrl: (result: { avatar?: string }) => result.avatar ?? null
	});
}

async function run(name: string, hits: typeof searchHits) {
	const ctx = context(hits);
	runInContext(ts.transpileModule(fn(name), {}).outputText, ctx);
	await runInContext(`${name}(${JSON.stringify(typed)})`, ctx);
	return ctx;
}

test('exactNFD picks the result whose name equals the reverse-resolved name, ignoring case', () => {
	expect(exactNFD(reverseName, searchHits)?.avatar).toBe('right.png');
	expect(exactNFD(reverseName, [searchHits[0]])).toBeNull();
});

test('destination: a typed address is labelled with its reverse-resolved NFD, not the first prefix hit', async () => {
	const ctx = await run('handleInput', searchHits);
	expect(ctx.resolvedName).toEqual({ name: reverseName, address: typed, avatar: 'right.png' });
	expect(ctx.algorandDestination.address).toBe(typed);
	expect(ctx.algorandDestination.name).toBe(reverseName);
});

test('destination: when no search hit matches exactly, the label keeps the name without an avatar', async () => {
	const ctx = await run('handleInput', [searchHits[0]]);
	expect(ctx.resolvedName).toEqual({ name: reverseName, address: typed, avatar: undefined });
});

test('source: a typed address is labelled with its reverse-resolved NFD and keeps the typed address', async () => {
	const ctx = await run('handleSourceInput', searchHits);
	expect(ctx.algorandSourceResolvedName).toEqual({
		name: reverseName,
		address: typed,
		avatar: 'right.png'
	});
	expect(ctx.algorandSourceAddress).toBe(typed);
});

test('source: when no search hit matches exactly, the label keeps the name without an avatar', async () => {
	const ctx = await run('handleSourceInput', [searchHits[0]]);
	expect(ctx.algorandSourceResolvedName).toEqual({
		name: reverseName,
		address: typed,
		avatar: undefined
	});
});
