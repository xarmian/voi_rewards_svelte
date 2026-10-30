import { test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import Modal from './Modal.svelte';

test('dialog uses the supplied visible heading as its accessible name', () => {
	const html = render(Modal, { props: { showModal: false, labelledby: 'x' } }).body;
	assert.match(html, /<dialog\b[^>]*aria-labelledby="x"/);
});

test('dialog omits aria-labelledby when no heading id is supplied', () => {
	const html = render(Modal, { props: { showModal: false } }).body;
	assert.doesNotMatch(html, /aria-labelledby/);
});
