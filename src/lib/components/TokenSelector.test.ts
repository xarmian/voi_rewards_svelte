import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import TokenSelector from './TokenSelector.svelte';

const source = readFileSync(new URL('./TokenSelector.svelte', import.meta.url), 'utf8');

it('labels a native token input without a Flowbite wrapper', () => {
	const { body } = render(TokenSelector);
	expect(body).toMatch(/<label\b[^>]*>Search tokens<\/label>/);
	expect(body).toMatch(/<input\b[^>]*aria-label="Search tokens"/);
	expect(source).not.toContain('flowbite-svelte');
});

it('names clear and reset controls for a selected token', () => {
	const { body } = render(TokenSelector, {
		props: {
			selectedToken: {
				id: 1,
				symbol: 'USDC',
				decimals: 6,
				type: 'ARC200',
				poolCount: 2,
				imageUrl: null
			}
		}
	});
	expect(body).toMatch(/<button\b[^>]*aria-label="Clear search"/);
	expect(body).toMatch(/<button\b[^>]*aria-label="Reset to VOI"/);
});

// SSR cannot open the dropdown or exercise focus. Pin its event wiring here;
// keyboard.test.ts covers the shared navigation model and browser review covers focus.
it('retains the native-button results group and keyboard wiring', () => {
	expect(source).toContain('role="group"');
	expect(source).toContain('aria-label="Token results"');
	expect(source).toContain('data-token-option');
	expect(source).toContain('onkeydown={handleInputKeydown}');
	expect(source).toContain('onkeydown={(event) => handleOptionKeydown(event, index)}');
	for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'])
		expect(source).toContain(`'${key}'`);
	expect(source).toContain('nextOptionIndex(index, filteredTokens.length, event.key)');
	expect(source).toContain('inputEl()?.focus()');
	expect(source).toContain('inputEl()?.blur()');
	expect(source).toContain("dispatch('tokenSelect', token)");
	expect(source).toContain("dispatch('tokenSelect', voiToken)");
	expect(source).toContain('onmousedown={(event) => event.preventDefault()}');
	expect(source).toContain('slice(0, 20)');
	expect(source).toContain('allTokens.slice(0, 10)');
	expect(source).toContain('<Chip tone="neutral" label={token.type} />');
});
