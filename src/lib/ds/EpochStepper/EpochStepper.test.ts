import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import EpochStepper from './EpochStepper.svelte';
const props = { epoch: 104, min: 1, max: 104, rangeLabel: (n: number) => `Range ${n}` };
const html = (extra = {}) =>
	render(EpochStepper, { props: { ...props, ...extra } }).body.replace(/<!--[\s\S]*?-->/g, '');
describe('EpochStepper SSR', () => {
	test('group and descending jump select are named', () => {
		const body = html();
		assert.match(body, /role="group"[^>]*aria-label="Epoch"/);
		assert.match(body, /<select[^>]*aria-label="Jump to epoch"/);
		assert.match(body, /<option[^>]*value="104"[^>]*>Epoch 104: Range 104<\/option>/);
		assert.equal([...body.matchAll(/<option[^>]*value="(\d+)"/g)][0][1], '104');
		assert.doesNotMatch(body, /<h[1-6]/);
	});
	test('bounds disable buttons and show only a glyph', () => {
		assert.match(
			html(),
			/<button[^>]*aria-label="Next epoch"[^>]*disabled[^>]*>[\s\S]*?›[\s\S]*?<\/button>/
		);
		assert.doesNotMatch(html(), /105/);
		assert.match(
			html({ epoch: 1 }),
			/<button[^>]*aria-label="Previous epoch"[^>]*disabled[^>]*>[\s\S]*?‹[\s\S]*?<\/button>/
		);
		assert.doesNotMatch(html({ epoch: 1 }), /‹ 0/);
		assert.match(
			html({ epoch: 1 }),
			/<option[^>]*value="1"[^>]*selected[^>]*>Epoch 1: Range 1<\/option>/
		);
	});
	test('middle buttons include their destination in the accessible label', () => {
		const body = html({ epoch: 104, max: 106 });
		assert.match(body, /aria-label="Previous epoch, 103"/);
		assert.match(body, /aria-label="Next epoch, 105"/);
	});
	test('jump can be omitted; live region starts empty even with URL sync', () => {
		const body = html({ jump: false, syncUrl: true, id: 'custom-stepper' });
		assert.doesNotMatch(body, /<select/);
		assert.match(body, /id="custom-stepper"/);
		assert.match(body, /<p[^>]*class="sr-only"[^>]*aria-live="polite"[^>]*>\s*<\/p>/);
	});
});
