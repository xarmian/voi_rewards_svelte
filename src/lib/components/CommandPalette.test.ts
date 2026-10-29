import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import CommandPalette from './CommandPalette.svelte';

it('renders a labelled native dialog and connected combobox/listbox without legacy styling', () => {
	const html = render(CommandPalette, { props: { onselect: () => undefined } }).body;
	expect(html).toMatch(/<dialog[^>]*aria-label="Search tokens"/);
	const input = html.match(/<input[^>]*>/)?.[0] ?? '';
	for (const attr of ['role="combobox"', 'aria-expanded="false"', 'aria-autocomplete="list"']) {
		expect(input).toContain(attr);
	}
	const inputId = input.match(/\bid="([^"]+)"/)?.[1];
	expect(inputId).toBeTruthy();
	expect(html).toMatch(new RegExp(`<label[^>]*for="${inputId}"[^>]*>Search tokens</label>`));
	const listboxId = input.match(/aria-controls="([^"]+)"/)?.[1];
	expect(listboxId).toBeTruthy();
	const listbox = html.match(/<[^>]*role="listbox"[^>]*>/)?.[0] ?? '';
	expect(listbox).toContain(`id="${listboxId}"`);
	// No option is active before client-side recents/results load.
	expect(input).not.toContain('aria-activedescendant=');
	expect(html).toContain('Type a token symbol');
	expect(html).not.toMatch(
		/flowbite|dark:|(?:bg|text|border)-(?:gray|purple)-|⌘K to open anywhere/
	);
});
