import { readable } from 'svelte/store';
import { config } from '$lib/config';
import { createPoller } from '$lib/utils/poller';

export type RecentBlock = { proposer: string; timestamp: string; block: number; votes: number };
export type RecentState = {
	blocks: RecentBlock[] | null;
	error: boolean;
	lastSuccess: number | null;
};

export function latest(res: RecentBlock[], n = 5): RecentBlock[] {
	return [...res].sort((a, b) => b.block - a.block).slice(0, n);
}

export function createRecentBlocks({
	fetch,
	now,
	document,
	intervalMs = 30000
}: {
	fetch: typeof globalThis.fetch;
	now: () => number;
	document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
	intervalMs?: number;
}) {
	let retry = () => Promise.resolve();
	const store = readable<RecentState>({ blocks: null, error: false, lastSuccess: null }, (set) => {
		let active = true;
		let state: RecentState = { blocks: null, error: false, lastSuccess: null };
		set(state);
		const poller = createPoller({
			visibility: document,
			task: async () => {
				try {
					const response = await fetch(`${config.proposalApiBaseUrl}?action=recent`, {
						signal: AbortSignal.timeout(10000),
						cache: 'no-store'
					});
					if (!response.ok) throw new Error('Recent blocks unavailable');
					const data: unknown = await response.json();
					if (
						!Array.isArray(data) ||
						!data.every(
							(row) =>
								typeof row?.proposer === 'string' &&
								Number.isFinite(row.block) &&
								typeof row.timestamp === 'string' &&
								Number.isFinite(Date.parse(row.timestamp))
						)
					)
						throw new Error('Invalid recent blocks');
					if (active) state = { blocks: latest(data), error: false, lastSuccess: now() };
				} catch {
					if (active) state = { ...state, error: true };
				}
				if (active) set(state);
			}
		});
		retry = poller.run;
		poller.start(intervalMs);
		return () => {
			active = false;
			poller.destroy();
			retry = () => Promise.resolve();
		};
	});
	return { subscribe: store.subscribe, retry: () => retry() };
}
