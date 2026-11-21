import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import BlockRewardStatusPill from './BlockRewardStatusPill.svelte';
import { BLOCK_REWARD_STATUS_TEXT, type BlockRewardReason } from '$lib/rewards/blockRewardStatus';

const status = (codes: BlockRewardReason[]) => ({
	registered: codes.length === 0,
	reasons: codes.map((code) => ({ code, text: BLOCK_REWARD_STATUS_TEXT[code] }))
});
const draw = (codes: BlockRewardReason[], compact = false) =>
	render(BlockRewardStatusPill, { props: { status: status(codes), compact } })
		.body.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/&#39;/g, "'");
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

it('shows the registered pill alone', () => {
	const html = draw([]);
	expect(text(html)).toContain('Registered for real-time block rewards');
	expect(html).not.toContain('<ul');
});

it('lists every reason under the not registered pill', () => {
	const html = text(draw(['not-opted-in', 'below-range']));
	expect(html).toContain('Not registered for real-time block rewards');
	expect(html).toContain(BLOCK_REWARD_STATUS_TEXT['not-opted-in']);
	expect(html).toContain(BLOCK_REWARD_STATUS_TEXT['below-range']);
});

it('compact form shows a short label with the full reasons behind a disclosure', () => {
	const html = draw(['contract', 'not-opted-in'], true);
	expect(html).toContain('<details');
	expect(text(html)).toMatch(/<?Not registered for real-time block rewards/);
	expect(text(html)).toContain('Contract not upgraded +1');
	expect(text(html)).toContain(BLOCK_REWARD_STATUS_TEXT.contract);
	expect(text(html)).toContain(BLOCK_REWARD_STATUS_TEXT['not-opted-in']);
	expect(draw([], true)).not.toContain('<details');
});
