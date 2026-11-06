import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

const page = new URL('./+page.svelte', import.meta.url);

test.each([
	page,
	new URL('../../../lib/chain/vanitySearch.ts', import.meta.url),
	new URL('../../../lib/chain/vanity.worker.ts', import.meta.url)
])('%s contains no external code loaders', (file) => {
	const source = readFileSync(file, 'utf8');
	expect(source).not.toMatch(/importScripts/);
	expect(source).not.toMatch(/<script\b[^>]*\bsrc\s*=/i);
	expect(source).not.toMatch(/cdn\.jsdelivr|cdnjs|unpkg|esm\.sh/i);
});

test('constructs the bundled module worker as a complete statement', () => {
	const source = readFileSync(page, 'utf8');
	expect(source).not.toMatch(/new\s+Blob\s*\(|createObjectURL/);
	expect(source).toMatch(
		/worker\s*=\s*new Worker\(\s*new URL\('\.\.\/\.\.\/\.\.\/lib\/chain\/vanity\.worker\.ts',\s*import\.meta\.url\),\s*\{\s*type: 'module'\s*\}\s*\);/
	);
});

test.each(['proceed', 'reload', 'blocked'] as const)('mount gates generation on %s', (decision) => {
	const source = readFileSync(page, 'utf8');
	const mount = source.match(/onMount\(\(\) => \{[^]*?\n\t\}\);/)?.[0];
	expect(mount).toBeDefined();
	const reload = vi.fn();
	const sessionStorage = { getItem: vi.fn(() => '1'), setItem: vi.fn(), removeItem: vi.fn() };
	const hasThirdPartyScript = vi.fn(() => true);
	const decideVanityStart = vi.fn(() => decision);
	const document = {};
	const window = { location: { reload } };
	const context = createContext({
		ready: false,
		blocked: false,
		document,
		window,
		sessionStorage,
		location: { origin: 'https://voirewards.com' },
		hasThirdPartyScript,
		decideVanityStart,
		onMount: (callback: () => void) => callback()
	});
	runInContext(ts.transpileModule(mount!, {}).outputText, context);
	expect(hasThirdPartyScript).toHaveBeenCalledWith(document, 'https://voirewards.com', window);
	expect(sessionStorage.getItem).toHaveBeenCalledWith('vanity-reloaded');
	expect(decideVanityStart).toHaveBeenCalledWith({ thirdParty: true, alreadyReloaded: true });
	expect(context.ready).toBe(decision === 'proceed');
	expect(context.blocked).toBe(decision === 'blocked');
	expect(reload).toHaveBeenCalledTimes(decision === 'reload' ? 1 : 0);
	if (decision === 'reload')
		expect(sessionStorage.setItem).toHaveBeenCalledWith('vanity-reloaded', '1');
	if (decision === 'proceed')
		expect(sessionStorage.removeItem).toHaveBeenCalledWith('vanity-reloaded');
});

test('the form and result UI require readiness and the handler also checks it', () => {
	const source = readFileSync(page, 'utf8');
	expect(source).toMatch(/async function generateVanityAddress\(\) \{\s*if \(!ready\) return;/);
	expect(source).toMatch(
		/\{#if ready\}\s*<Card title="Choose your pattern">[^]*<form[^]*<\/form>[^]*<\/Card>\s*\{#if result\}[^]*<Web3Wallet[^]*<\/Card>\s*\{\/if\}\s*\{\/if\}/
	);
	expect(source).toMatch(
		/\{#if blocked\}\s*<InlineAlert\s+message="Key generation is switched off because another script is loaded in this page\.\s+Open\s+voirewards\.com\/vanity directly in a new tab\."\s*\/>\s*\{\/if\}/
	);
});
