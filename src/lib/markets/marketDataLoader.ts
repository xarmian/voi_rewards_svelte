export interface MarketDataState {
	tokenId: number | null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Market rows retain the API's existing shape.
	marketData: any[];
	aggregates: { totalVolume: number; totalTvl: number; weightedAveragePrice: number };
	circulatingSupply: { circulatingSupply: number; percentDistributed: number } | null;
	voiUsdStatus: 'ok' | 'stale' | 'invalid' | 'unavailable' | null;
	voiUsdAsOf: string | null;
	loading: boolean;
	error: string | null;
}

export const EMPTY_AGGREGATES = { totalVolume: 0, totalTvl: 0, weightedAveragePrice: 0 };

export function createMarketDataLoader(
	fetchFn: (url: string) => Promise<Response>,
	onState: (s: MarketDataState) => void,
	initial?: Partial<MarketDataState>
): {
	load(tokenId: number, opts?: { force?: boolean }): Promise<boolean>;
	isCurrent(requestId: number): boolean;
	readonly currentRequestId: number;
	readonly state: MarketDataState;
} {
	let state: MarketDataState = {
		tokenId: null,
		marketData: [],
		aggregates: EMPTY_AGGREGATES,
		circulatingSupply: null,
		voiUsdStatus: null,
		voiUsdAsOf: null,
		loading: false,
		error: null,
		...initial
	};
	let currentRequestId = 0;
	let inFlight: { tokenId: number; promise: Promise<boolean> } | null = null;

	function isCurrent(requestId: number) {
		return requestId === currentRequestId;
	}

	function emit(next: MarketDataState) {
		state = next;
		onState(state);
	}

	function load(tokenId: number, opts?: { force?: boolean }): Promise<boolean> {
		if (!opts?.force) {
			if (inFlight?.tokenId === tokenId) return inFlight.promise;
			// A settled, error-free result for this token is reused even when it has no rows: a
			// pool-less token's empty server result must not refetch after hydration (TASK-27).
			if (!inFlight && state.tokenId === tokenId && !state.loading && state.error === null) {
				return Promise.resolve(false);
			}
		}

		const requestId = ++currentRequestId;
		const switching = tokenId !== state.tokenId;
		emit({
			...state,
			tokenId,
			marketData: switching ? [] : state.marketData,
			aggregates: switching ? EMPTY_AGGREGATES : state.aggregates,
			voiUsdStatus: switching ? null : state.voiUsdStatus,
			voiUsdAsOf: switching ? null : state.voiUsdAsOf,
			loading: true,
			error: null
		});

		const promise = (async () => {
			try {
				const response = await fetchFn(`/api/markets?tokenId=${tokenId}`);
				if (!response.ok) throw new Error(`Failed to load markets (${response.status})`);
				const data = await response.json();
				if (data.error) throw new Error(String(data.error));
				if (!isCurrent(requestId)) return false;

				emit({
					...state,
					marketData: Array.isArray(data.marketData) ? data.marketData : [],
					aggregates: data.aggregates || EMPTY_AGGREGATES,
					circulatingSupply: data.circulatingSupply ?? state.circulatingSupply,
					voiUsdStatus: data.voiUsdStatus ?? null,
					voiUsdAsOf: data.voiUsdAsOf ?? null,
					loading: false,
					error: null
				});
			} catch (error) {
				if (!isCurrent(requestId)) return false;
				emit({
					...state,
					marketData: [],
					aggregates: EMPTY_AGGREGATES,
					voiUsdStatus: null,
					voiUsdAsOf: null,
					loading: false,
					error: error instanceof Error ? error.message : String(error)
				});
			}
			return true;
		})().finally(() => {
			if (isCurrent(requestId)) inFlight = null;
		});
		inFlight = { tokenId, promise };
		return promise;
	}

	return {
		load,
		isCurrent,
		get currentRequestId() {
			return currentRequestId;
		},
		get state() {
			return state;
		}
	};
}
