import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import { applyRecipientLookup, nextLookupId, tokenKey } from '../chain/recipientInfo';

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
		nextLookupId,
		tokenKey,
		onError,
		error: 'current error',
		notice: 'current notice'
	});
	runInContext(
		ts.transpileModule(
			[
				source.match(/\tconst LOOKUP_BANNER =\s*[^;]+;/)?.[0],
				source.match(/\tfunction syncLookupBanner\([^]*?\n\t\}/)?.[0],
				source.match(/\tfunction handleRecipientError\([^]*?\n\t\}/)?.[0],
				body
			]
				.filter(Boolean)
				.join('\n'),
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
		lookup: (address: string, ticket?: number) => {
			if (file === 'RecipientRow.svelte') {
				return runInContext(`fetchRecipientInfo('${address}')`, context) as Promise<void>;
			}
			// Modal callers invalidate before queueing; explicit tickets exercise already queued work.
			if (ticket === undefined) {
				ticket = nextLookupId();
				Object.assign(recipient, {
					lookupId: ticket,
					isValid: false,
					info: null,
					lookupError: null,
					isLoading: true
				});
			}
			return runInContext(`fetchRecipientInfo('${address}', ${ticket})`, context) as Promise<void>;
		}
	};
}

test('RecipientRow stops loading and clears errors when the row is cleared', () => {
	const file = 'RecipientRow.svelte';
	const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
	const handler = source.match(/\tasync function handleRecipientSelected\([^]*?\n\t\}/)?.[0];
	const clear = handler?.match(/if \(address === ''\) \{([^]*?)\n\t\t\}/)?.[1];
	expect(clear, `Keep the clear-address branch in ${file}`).toBeDefined();
	expect(clear, `Clearing ${file} must stop its loading indicator`).toMatch(
		/isLoading\s*=\s*false/
	);
	expect(clear, `Clearing ${file} must remove its lookup error`).toMatch(/lookupError\s*=\s*null/);
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

test('SendTokenModal applies queued ticket work to a clone made before the worker starts', async () => {
	const pending = Promise.withResolvers<unknown>();
	const { run, lookup } = recipientLookup(
		'SendTokenModal.svelte',
		vi.fn().mockReturnValue(pending.promise)
	);
	const ticket = nextLookupId();
	run(`Object.assign(recipient, {
		lookupId: ${ticket}, isValid: false, info: null, lookupError: null, isLoading: true
	})`);
	// The pool has not started this work item when a bulk action clones the row.
	run('recipients = recipients.map((r) => ({ ...r, amount: "1" }))');
	const clone = run('recipients[0]');
	const loading = lookup('old', ticket);
	pending.resolve({ status: 'loaded', info: { balance: 999 } });
	await loading;
	expect(run('recipients[0]')).toMatchObject({
		address: 'old',
		amount: '1',
		lookupId: ticket,
		info: { balance: 999 },
		isValid: true,
		isLoading: false,
		lookupError: null
	});
	expect(clone).not.toBe(run('recipient'));
});

test.each(['reticketed', 'token changed', 'removed', 'address changed'])(
	'SendTokenModal drops queued work when its row is %s',
	async (change) => {
		const pending = Promise.withResolvers<unknown>();
		const load = vi.fn().mockReturnValue(pending.promise);
		const { run, lookup } = recipientLookup('SendTokenModal.svelte', load);
		const ticket = nextLookupId();
		run(`Object.assign(recipient, {
			lookupId: ${ticket}, isValid: false, info: null, lookupError: null, isLoading: true
		})`);
		run('recipients = recipients.map((r) => ({ ...r, amount: "1" }))');
		const loading = lookup('old', ticket);
		if (change === 'reticketed') run(`recipients[0].lookupId = ${ticket + 1}`);
		if (change === 'token changed') run('selectedToken = { type: "vsa", id: "123" }');
		if (change === 'removed') run('recipients = []');
		if (change === 'address changed') {
			run(`recipients[0] = { ...recipients[0], address: "new", lookupId: ${ticket + 1} }`);
		}
		const rows = run('recipients');
		const before = structuredClone(rows);
		pending.resolve({ status: 'loaded', info: { balance: 999 } });
		await loading;
		expect(load).toHaveBeenCalledOnce();
		expect(run('recipients')).toBe(rows);
		expect(run('recipients')).toEqual(before);
		expect(run('error')).toBe('current error');
		expect(run('notice')).toBe('current notice');
	}
);

const lookupError = "Couldn't check this recipient. Sending is blocked until it can be checked.";

test.each([
	{ error: 'send failed', siblingError: null, expected: 'send failed' },
	{ error: lookupError, siblingError: null, expected: null },
	{ error: null, siblingError: 'unavailable', expected: lookupError }
])(
	'SendTokenModal derives the lookup banner without clearing unrelated errors: %j',
	async (state) => {
		const { run, lookup } = recipientLookup(
			'SendTokenModal.svelte',
			vi.fn().mockResolvedValue({ status: 'loaded', info: { balance: 456 } })
		);
		run(`error = ${JSON.stringify(state.error)}`);
		run(
			`recipients.push({ address: "sibling", lookupError: ${JSON.stringify(state.siblingError)} })`
		);
		await lookup('old');
		expect(run('error')).toBe(state.expected);
		expect(run('notice')).toBeNull();
	}
);

test.each([
	{
		message: 'send failed',
		error: lookupError,
		siblingError: 'unavailable',
		expected: 'send failed'
	},
	{ message: null, error: null, siblingError: 'unavailable', expected: lookupError },
	{ message: null, error: 'send failed', siblingError: null, expected: 'send failed' },
	{ message: null, error: lookupError, siblingError: null, expected: null }
])('SendTokenModal recipient onError preserves current banner state: %j', (state) => {
	const { run } = recipientLookup('SendTokenModal.svelte', vi.fn());
	run('recipient.lookupError = null');
	run(`error = ${JSON.stringify(state.error)}`);
	run(
		`recipients.push({ address: "sibling", lookupError: ${JSON.stringify(state.siblingError)} })`
	);
	run(`handleRecipientError(${JSON.stringify(state.message)})`);
	expect(run('error')).toBe(state.expected);
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
