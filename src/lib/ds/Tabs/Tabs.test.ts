import { test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import Tabs from './Tabs.svelte';
import { WALLET_TABS } from './hash';

test('nav uses real links and one current page, without tab roles', () => {
	const html = render(Tabs, {
		props: {
			variant: 'nav',
			label: 'Wallet sections',
			current: 'holdings',
			items: WALLET_TABS.map((id) => ({ id, label: id, href: `#${id}` }))
		}
	}).body;
	assert.match(html, /<nav[^>]*aria-label="Wallet sections"/);
	assert.equal((html.match(/<a href="#/g) ?? []).length, 5);
	assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
	assert.match(html, /<a href="#holdings"[^>]*aria-current="page"/);
	assert.doesNotMatch(html, /role="tab(?:list)?"/);
});
test('segmented uses pressed buttons in a named group', () => {
	const html = render(Tabs, {
		props: {
			variant: 'segmented',
			label: 'Range',
			value: '12',
			options: [
				{ value: '12', label: '12 epochs' },
				{ value: '26', label: '26 epochs' },
				{ value: 'all', label: 'All' }
			]
		}
	}).body;
	assert.match(html, /role="group" aria-label="Range"/);
	assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
	assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 2);
	assert.equal((html.match(/<button type="button"/g) ?? []).length, 3);
});
