import { readable } from 'svelte/store';

export type ChainStatus = {
	round: number | null;
	lastRoundAt: number | null;
	lastChangeAt: number | null;
	error: boolean;
	checkedAt: number | null;
	startedAt: number | null;
};
type Dependencies = {
	fetch?: typeof globalThis.fetch;
	now?: () => number;
	document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
};
const initial: ChainStatus = {
	round: null,
	lastRoundAt: null,
	lastChangeAt: null,
	error: false,
	checkedAt: null,
	startedAt: null
};

export function freshness(
	state: ChainStatus,
	now: number,
	thresholdMs = 5 * 60_000
): {
	tone: 'ok' | 'warn' | 'neutral';
	minutesOld: number | null;
	unavailable: boolean;
} {
	if (state.lastChangeAt !== null) {
		const age = now - state.lastChangeAt;
		return {
			tone: age > thresholdMs ? 'warn' : 'ok',
			minutesOld: Math.floor(age / 60_000),
			unavailable: false
		};
	}
	const unavailable = state.startedAt !== null && now - state.startedAt > thresholdMs;
	return { tone: unavailable ? 'warn' : 'neutral', minutesOld: null, unavailable };
}

export function createChainStatus(deps: Dependencies = {}) {
	return readable<ChainStatus>(initial, (set) => {
		const document = deps.document ?? globalThis.document;
		if (!document) return;
		const fetch = deps.fetch ?? globalThis.fetch;
		const now = deps.now ?? Date.now;
		let state = { ...initial, startedAt: now() };
		let active = true;
		let inFlight = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		set(state);

		async function poll() {
			if (!active || inFlight || document.visibilityState !== 'visible') return;
			clearTimeout(timer);
			inFlight = true;
			try {
				const response = await fetch('https://mainnet-api.voi.nodely.dev/v2/status', {
					signal: AbortSignal.timeout(10_000)
				});
				if (!response.ok) throw new Error(`Chain status HTTP ${response.status}`);
				const data = await response.json();
				const round = data['last-round'];
				const ageNs = data['time-since-last-round'];
				if (!Number.isSafeInteger(round) || round <= 0 || !Number.isFinite(ageNs) || ageNs < 0) {
					throw new Error('Invalid chain status');
				}
				if (!active) return;
				const checkedAt = now();
				state = {
					...state,
					round,
					checkedAt,
					error: false,
					lastRoundAt: checkedAt - ageNs / 1_000_000,
					lastChangeAt: state.round === null || round > state.round ? checkedAt : state.lastChangeAt
				};
				set(state);
			} catch {
				if (!active) return;
				state = { ...state, error: true, checkedAt: now() };
				set(state);
			} finally {
				inFlight = false;
				if (active && document.visibilityState === 'visible') timer = setTimeout(poll, 30_000);
			}
		}
		function visibilityChanged() {
			clearTimeout(timer);
			if (document.visibilityState === 'visible') void poll();
		}
		document.addEventListener('visibilitychange', visibilityChanged);
		void poll();
		return () => {
			active = false;
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', visibilityChanged);
		};
	});
}

export const chainStatus = createChainStatus();
