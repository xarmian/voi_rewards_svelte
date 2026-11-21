import { writable } from 'svelte/store';
import { EPOCH_REWARDS_ENABLED } from '../config';
import { epochHistory } from '../source';
import { epochSeries, type EpochResource, type Range } from './series';

export type EpochAnalyticsState = {
	epochs: EpochResource | null;
	busy: boolean;
	range: Range;
	announcement: string;
};

/** The analytics page's epoch charts: one read of the epoch stats, and the APR range. */
export function createEpochAnalytics(
	deps: { fetch?: typeof globalThis.fetch; now?: () => number } = {}
) {
	const fetch = deps.fetch ?? globalThis.fetch;
	const now = deps.now ?? Date.now;
	let state: EpochAnalyticsState = { epochs: null, busy: true, range: '26', announcement: '' };
	const { subscribe, set } = writable(state);
	let requests = 0;
	function publish(change: Partial<EpochAnalyticsState>) {
		state = { ...state, ...change };
		set(state);
	}
	async function retry() {
		const request = ++requests;
		publish({ busy: true });
		let input: unknown = null;
		try {
			const response = await fetch(epochHistory.statsUrl(), {
				signal: AbortSignal.timeout(10_000)
			});
			if (response.ok) input = await response.json();
		} catch {
			input = null;
		}
		if (request !== requests) return;
		publish({ epochs: epochSeries(input, state.epochs ?? undefined, now()) });
		publish({ busy: false });
	}
	function setRange(range: Range) {
		if (state.range === range) return;
		publish({
			range,
			announcement:
				range === 'all' ? 'APR range: all available epochs.' : `APR range: last ${range} epochs.`
		});
	}
	return { subscribe, retry, setRange, load: retry };
}

export type EpochAnalytics = ReturnType<typeof createEpochAnalytics>;

/** The analytics page's epoch half, or null when epoch rewards are off (then nothing is read). */
export function epochAnalytics(deps?: Parameters<typeof createEpochAnalytics>[0]) {
	return EPOCH_REWARDS_ENABLED ? createEpochAnalytics(deps) : null;
}
