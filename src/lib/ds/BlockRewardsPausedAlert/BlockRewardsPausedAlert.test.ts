import { expect, test } from 'vitest';
import { render } from 'svelte/server';
import { BLOCK_REWARDS_PAUSED_TEXT } from '$lib/rewards/blockRewardStatus';
import BlockRewardsPausedAlert from './BlockRewardsPausedAlert.svelte';
import { BlockRewardsPausedAlert as exported } from '$lib/ds';

test('warns that block rewards are paused, with no retry', () => {
	const html = render(BlockRewardsPausedAlert).body;
	expect(html).toMatch(/role="alert"/);
	expect(html).toContain('bg-warn-soft');
	expect(html).toContain(BLOCK_REWARDS_PAUSED_TEXT);
	expect(html).not.toContain('<button');
	expect(exported).toBe(BlockRewardsPausedAlert);
});
