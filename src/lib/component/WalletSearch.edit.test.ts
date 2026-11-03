import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('./WalletSearch.svelte', import.meta.url), 'utf8');
const fn = (name: string) => source.match(new RegExp(`function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';

test('remembers selected text and exposes an optional edit callback', () => {
	expect(source).toMatch(/export let onEdit:\s*\(\(\) => void\) \| undefined/);
	expect(source).toMatch(/let selectedText:\s*string \| null = null/);
	expect(fn('handleSubmit')).toMatch(/selectedText\s*=\s*searchText/);
});
test.each([null, 'alice.voi'])(
	'only invalidates changed text after selection (%s)',
	(selectedText) => {
		const onEdit = vi.fn();
		const debouncedSearch = vi.fn();
		const context = createContext({ selectedText, searchText: 'bob.voi', onEdit, debouncedSearch });
		runInContext(ts.transpileModule(fn('handleInput'), {}).outputText, context);
		runInContext('handleInput()', context);
		expect(onEdit).toHaveBeenCalledTimes(selectedText === null ? 0 : 1);
		if (selectedText !== null) {
			expect(runInContext('selectedText', context)).toBeNull();
			expect(onEdit.mock.invocationCallOrder[0]).toBeLessThan(
				debouncedSearch.mock.invocationCallOrder[0]
			);
			runInContext('handleInput()', context);
			expect(onEdit).toHaveBeenCalledOnce();
		}
	}
);
test('does not invalidate unchanged selected text or require an onEdit callback', () => {
	const onEdit = vi.fn();
	const context = createContext({
		selectedText: 'alice.voi',
		searchText: 'alice.voi',
		onEdit,
		debouncedSearch: vi.fn()
	});
	runInContext(ts.transpileModule(fn('handleInput'), {}).outputText, context);
	runInContext('handleInput()', context);
	expect(onEdit).not.toHaveBeenCalled();
	runInContext('onEdit = undefined; searchText = "bob.voi"; handleInput()', context);
	expect(runInContext('selectedText', context)).toBeNull();
});

test('uses the current input event value before checking for an edit', () => {
	const onEdit = vi.fn();
	const context = createContext({
		selectedText: 'alice.voi',
		searchText: 'alice.voi',
		onEdit,
		debouncedSearch: vi.fn()
	});
	runInContext(ts.transpileModule(fn('handleInput'), {}).outputText, context);
	runInContext('handleInput({ currentTarget: { value: "bob.voi" } })', context);
	expect(onEdit).toHaveBeenCalledOnce();
	expect(runInContext('searchText', context)).toBe('bob.voi');
});
