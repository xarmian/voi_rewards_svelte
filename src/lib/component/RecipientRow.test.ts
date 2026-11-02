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
