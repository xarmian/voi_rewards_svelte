import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import ThemeToggle from './ThemeToggle.svelte';

describe('ThemeToggle SSR', () => {
	test('renders one button with both CSS-selected action names and decorative icons', () => {
		const { body } = render(ThemeToggle);
		assert.equal((body.match(/<button\b/g) ?? []).length, 1);
		assert.match(body, /<button\b[^>]*type="button"/);
		for (const action of ['dark', 'light']) {
			assert.match(
				body,
				new RegExp(
					`<span class="ds-theme-to-${action}[^"]*">[\\s\\S]*?<span class="sr-only">Switch to ${action} theme</span>\\s*</span>`
				)
			);
		}
		const icons = body.match(/<svg\b[^>]*>/g) ?? [];
		assert.equal(icons.length, 2);
		for (const icon of icons) assert.match(icon, /aria-hidden="true"/);
		assert.doesNotMatch(body, /aria-pressed|dark:|(?:gray|slate|purple)-/);
	});

	test('uses surface colors by default and accepts hero colors without conflicting defaults', () => {
		const surface = render(ThemeToggle).body;
		assert.match(surface, /text-ink-muted hover:text-ink/);
		const hero = render(ThemeToggle, { props: { class: 'text-on-hero' } }).body;
		assert.match(hero, /text-on-hero/);
		assert.doesNotMatch(hero, /text-ink-muted|hover:text-ink/);
		assert.doesNotMatch(hero, /focus:outline-none/);
	});
});
