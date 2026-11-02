import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

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
		onError,
		error: 'current error',
		notice: 'current notice'
	});
	runInContext(
		ts.transpileModule(body, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	return {
		recipient,
		onError,
		run: (code: string) => runInContext(code, context),
		lookup: (address: string) =>
			runInContext(`fetchRecipientInfo('${address}', 0)`, context) as Promise<void>
	};
}

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
			expect(recipient).toMatchObject({ isValid: true, info, isLoading: false });
		}
	);
}
