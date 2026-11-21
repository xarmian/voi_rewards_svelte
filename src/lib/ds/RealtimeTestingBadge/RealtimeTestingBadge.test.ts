import { beforeEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
const flag = vi.hoisted(() => ({ testing: true }));
vi.mock('$lib/rewards/blockRewardLabels', async (original) => ({
	...(await original<typeof import('$lib/rewards/blockRewardLabels')>()),
	get REALTIME_BLOCK_REWARDS_TESTING() {
		return flag.testing;
	}
}));
import RealtimeTestingBadge from './RealtimeTestingBadge.svelte';
import { RealtimeTestingBadge as exported } from '$lib/ds/RealtimeTestingBadge';

beforeEach(() => {
	flag.testing = true;
});

it('shows an info Testing pill while real-time block rewards are in testing', () => {
	const html = render(RealtimeTestingBadge).body;
	expect(html).toContain('Testing');
	expect(html).toContain('bg-accent-soft text-accent');
	expect(exported).toBe(RealtimeTestingBadge);
});

it('renders nothing once testing is switched off', () => {
	flag.testing = false;
	const html = render(RealtimeTestingBadge).body.replace(/<!--[\s\S]*?-->/g, '');
	expect(html).not.toContain('Testing');
	expect(html.trim()).toBe('');
});
