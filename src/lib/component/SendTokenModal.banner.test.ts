import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./SendTokenModal.svelte', import.meta.url), 'utf8');
const BANNER = "Couldn't check this recipient. Sending is blocked until it can be checked.";

function bannerHarness(recipients: { lookupError?: string | null }[], error: string | null) {
	const constant = source.match(/\tconst LOOKUP_BANNER = [^;]+;/)?.[0];
	const sync = source.match(/\tfunction syncLookupBanner\([^]*?\n\t\}/)?.[0];
	expect(constant, 'Keep the banner text in one LOOKUP_BANNER constant').toBeDefined();
	expect(sync, 'Keep a syncLookupBanner function').toBeDefined();
	const context = createContext({ recipients, error });
	runInContext(
		ts.transpileModule(`${constant}\n${sync}`, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	return {
		sync: () => runInContext('syncLookupBanner()', context),
		error: () => runInContext('error', context) as string | null
	};
}

test('the banner text lives in one constant', () => {
	expect(source.split(BANNER).length - 1, 'The banner text must appear exactly once').toBe(1);
});

test('syncLookupBanner raises the banner while any row has a lookup error', () => {
	const h = bannerHarness([{ lookupError: null }, { lookupError: 'fetch failed' }], null);
	h.sync();
	expect(h.error()).toBe(BANNER);
});

test('syncLookupBanner overrides nothing but its own text when no row has an error', () => {
	const own = bannerHarness([{ lookupError: null }], BANNER);
	own.sync();
	expect(own.error(), 'A stale banner is cleared').toBeNull();
	const unrelated = bannerHarness([{ lookupError: null }], 'Transaction failed');
	unrelated.sync();
	expect(unrelated.error(), 'An unrelated error is preserved').toBe('Transaction failed');
});

test('syncLookupBanner keeps the banner when a row still has an error and another error is set', () => {
	const h = bannerHarness([{ lookupError: 'x' }], 'Transaction failed');
	h.sync();
	expect(h.error(), 'A lookup failure outranks a stale unrelated message').toBe(BANNER);
});

test('the banner is re-derived wherever rows change', () => {
	const remove = source.match(/\tfunction removeRecipient\([^]*?\n\t\}/)?.[0] ?? '';
	expect(remove, 'Removing a row can remove the only lookup error').toContain('syncLookupBanner()');
	const paste = source.match(/\tasync function handlePasteModalConfirm\([^]*?\n\t\}/)?.[0] ?? '';
	const reset = paste.indexOf('error = null;');
	const sync = paste.indexOf('syncLookupBanner()');
	const pool = paste.indexOf('await runBounded(');
	expect(reset, 'Import resets stale messages').toBeGreaterThan(-1);
	expect(
		sync,
		'Import must re-raise the banner for rows that still have a lookup error'
	).toBeGreaterThan(reset);
	expect(sync).toBeLessThan(pool);
	const fetch = source.match(/\tasync function fetchRecipientInfo\([^]*?\n\t\}/)?.[0] ?? '';
	expect(fetch, 'A finished lookup re-derives the banner').toContain('syncLookupBanner()');
	const handler = source.match(/\tfunction handleRecipientError\([^]*?\n\t\}/)?.[0] ?? '';
	expect(handler, 'A row-level success re-derives the banner').toContain('syncLookupBanner()');
});
