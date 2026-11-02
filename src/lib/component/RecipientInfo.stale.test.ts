import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import { applyRecipientLookup } from '../chain/recipientInfo';

const components = ['RecipientRow.svelte', 'SendTokenModal.svelte'];

// Exercise the actual lookup functions without a DOM renderer, as in SendTokenModal.test.ts.
function recipientLookup(file: string, loadRecipientInfo: ReturnType<typeof vi.fn>) {
	const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
	const body = source.match(/\tasync function fetchRecipientInfo\([^]*?\n\t\}/)?.[0];
	if (!body) throw new Error(`Missing fetchRecipientInfo in ${file}`);
	const recipient = {
		address: 'old',
		info: { balance: 123 },
		isValid: true,
		isLoading: false,
		lookupError: 'previous error'
	};
	const onError = vi.fn();
	const context = createContext({
		recipient,
		recipients: [recipient],
		selectedToken: { type: 'native' },
		isNativeToken: () => true,
		loadRecipientInfo,
		applyRecipientLookup,
		onError,
		error: 'current error',
		notice: 'current notice'
	});
	runInContext(
		ts.transpileModule(
			[source.match(/\tfunction tokenKey\([^]*?\n\t\}/)?.[0], body].filter(Boolean).join('\n'),
			{
				compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
			}
		).outputText,
		context
	);
	return {
		recipient,
		onError,
		run: (code: string) => runInContext(code, context),
		lookup: (address: string) =>
			runInContext(`fetchRecipientInfo('${address}', recipient)`, context) as Promise<void>
	};
}

test.each(components)('%s stops loading and clears errors when the row is cleared', (file) => {
	const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
	const handler = source.match(/\tasync function handleRecipientSelected\([^]*?\n\t\}/)?.[0];
	const clear = handler?.match(/if \(address === ''\) \{([^]*?)\n\t\t\}/)?.[1];
	expect(clear, `Keep the clear-address branch in ${file}`).toBeDefined();
	expect(clear, `Clearing ${file} must stop its loading indicator`).toMatch(
		file === 'RecipientRow.svelte' ? /isLoading\s*=\s*false/ : /isLoading:\s*false/
	);
	expect(clear, `Clearing ${file} must remove its lookup error`).toMatch(
		file === 'RecipientRow.svelte' ? /lookupError\s*=\s*null/ : /lookupError:\s*null/
	);
});

test('SendTokenModal applies a result to its row after an earlier row is removed', async () => {
	const pending = Promise.withResolvers<unknown>();
	const { run, lookup } = recipientLookup(
		'SendTokenModal.svelte',
		vi.fn().mockReturnValue(pending.promise)
	);
	run('recipients.unshift({ address: "earlier" })');
	const loading = lookup('old');
	run('recipients.shift()');
	const info = { balance: 456 };
	pending.resolve({ status: 'loaded', info });
	await loading;
	expect(run('recipients[0]')).toMatchObject({ isValid: true, info, isLoading: false });
});

test('SendTokenModal applies a result when its row is cloned with the same address', async () => {
	const pending = Promise.withResolvers<unknown>();
	const { run, lookup } = recipientLookup(
		'SendTokenModal.svelte',
		vi.fn().mockReturnValue(pending.promise)
	);
	const loading = lookup('old');
	run('recipients = [{ address: "old", info: null, isValid: false, isLoading: true }]');
	pending.resolve({ status: 'loaded', info: { balance: 999 } });
	await loading;
	expect(run('recipients[0]')).toEqual({
		address: 'old',
		info: { balance: 999 },
		isValid: true,
		isLoading: false,
		lookupError: null
	});
});

for (const file of components) {
	test.each(['loaded', 'unavailable'])(
		`${file} drops a stale %s result while the new address is still loading`,
		async (status) => {
			const old = Promise.withResolvers<unknown>();
			const current = Promise.withResolvers<unknown>();
			const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
			const { recipient, onError, run, lookup } = recipientLookup(file, load);
			const oldLookup = lookup('old');
			expect(recipient).toMatchObject({
				isValid: false,
				info: null,
				lookupError: null,
				isLoading: true
			});
			recipient.address = 'new';
			const currentLookup = lookup('new');
			old.resolve({ status, info: { balance: 999 }, error: 'stale error' });
			await oldLookup;

			expect(recipient).toMatchObject({
				isValid: false,
				info: null,
				lookupError: null,
				isLoading: true
			});
			expect(onError).not.toHaveBeenCalled();
			expect(run('error')).toBe('current error');
			expect(run('notice')).toBe('current notice');

			const info = { balance: 456 };
			current.resolve({ status: 'loaded', info });
			await currentLookup;
			expect(run(file === 'RecipientRow.svelte' ? 'recipient' : 'recipients[0]')).toMatchObject({
				isValid: true,
				info,
				isLoading: false
			});
		}
	);
}
