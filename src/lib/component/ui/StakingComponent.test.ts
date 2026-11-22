import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const source = readFileSync(new URL('./StakingComponent.svelte', import.meta.url), 'utf8');

it('renders the loading overlay inline in the template, not through {@html}', () => {
	expect(source).not.toContain('{@html');
	expect(source).toContain('Loading...');
	expect(source).toContain('animate-spin');
});
