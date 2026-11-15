import { test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import RowMenu from './RowMenu.svelte';

test('the menu styles bare menuitem buttons', () => {
	const children = createRawSnippet(() => ({
		render: () =>
			'<button type="button" role="menuitem">Withdraw</button><button type="button" role="menuitem">Register participation key</button>'
	}));
	const { body } = render(RowMenu, {
		props: {
			id: 'contract-actions',
			name: 'Contract',
			trigger: {} as HTMLButtonElement,
			onclose: () => {},
			children
		}
	});
	const menu = body.match(/<div\b[^>]*role="menu"[^>]*>/)?.[0];
	assert.ok(menu, 'the menu is rendered');
	const classes = menu
		.match(/\bclass="([^"]*)"/)?.[1]
		.replaceAll('&amp;', '&')
		.split(/\s+/);
	assert.ok(classes, 'the menu has a class attribute');
	for (const variant of [
		'[&_[role=menuitem]]:block',
		'[&_[role=menuitem]]:w-full',
		'[&_[role=menuitem]]:px-3',
		'[&_[role=menuitem]]:py-2',
		'[&_[role=menuitem]:hover]:bg-surface-2'
	]) {
		assert.ok(classes.includes(variant), `the menu owns item styling: ${variant}`);
	}
});
