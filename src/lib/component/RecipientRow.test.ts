import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./RecipientRow.svelte', import.meta.url), 'utf8');

// Svelte's bind:value on a type="number" input writes a number (or null when empty) into the
// bound object. recipient.amount must stay the typed string: decimalToBaseUnits parses a string,
// and handleAmountChange is what writes the digit-limited string to the row and the parent.
test('RecipientRow does not bind the amount input to recipient.amount', () => {
	expect(
		source,
		'bind:value on the number Input writes a number or null into recipient.amount; use value={recipient.amount} and let handleAmountChange write the string'
	).not.toMatch(/bind:value=\{\s*recipient\.amount\s*\}/);
});

test('RecipientRow still renders the amount from recipient.amount and writes it on input', () => {
	expect(source).toMatch(/value=\{\s*recipient\.amount\s*\}/);
	expect(source).toMatch(/on:input=\{\s*handleAmountChange\s*\}/);
});

test('Max visibility compares exact base units and fills the original max string', async () => {
	const { createContext, runInContext } = await import('node:vm');
	const { decimalToBaseUnits } = await import('../chain/baseUnits');
	const ts = await import('typescript');
	const fn = source.match(/\tfunction isBelowMax\([\s\S]*?\n\t\}/)?.[0] || '';
	const condition = source.match(
		/\{#if ([^\n]+)\}\s*<button\s*type="button"\s*class="hidden sm:absolute/
	)?.[1];
	expect(condition).toBeDefined();
	const maxAmount = '1.152921504606846976';
	const context = createContext({
		decimalToBaseUnits,
		maxAmount,
		decimals: 18,
		recipient: { amount: '' },
		index: 0,
		onAmountChange: (_: number, amount: string) => {
			expect(amount).toBe(maxAmount);
		}
	});
	runInContext(
		ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
		context
	);
	for (const [amount, visible] of [
		['', true],
		['bad', true],
		['1.152921504606846975', true],
		[maxAmount, false],
		['1.152921504606846977', false]
	] as const) {
		context.recipient.amount = amount;
		expect(runInContext(condition!, context), amount).toBe(visible);
	}
	const fill = source.match(
		/on:click=\{\(\) => \{\s*(recipient.amount = maxAmount[\s\S]*?)\}\}/
	)?.[1];
	expect(fill).toBeDefined();
	runInContext(fill!, context);
	expect(context.recipient.amount).toBe(maxAmount);
});
