import { writable, derived, get } from 'svelte/store';
import { config } from '$lib/config';

export interface RewardParams {
	block_reward_pool: number;
	total_blocks: number;
	reward_per_block: number;
	total_blocks_projected: number;
}

export interface DateRange {
	id: string;
	desc: string;
	epoch: number;
}

export function buildDateRanges(maxTimestamp: Date): DateRange[] {
	const minTimestamp = new Date('2024-10-30T00:00:00Z');

	const dates: DateRange[] = [];
	const currentDate = new Date(minTimestamp.toISOString().substring(0, 10) + 'T00:00:00Z');
	let epoch = 1;

	while (currentDate <= maxTimestamp) {
		const startOfWeek = new Date(currentDate);
		startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay() + 3);

		const endOfWeek = new Date(startOfWeek);
		endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 6);

		const dateStr = `${startOfWeek.toISOString().substring(0, 10).replace(/-/g, '')}-${endOfWeek.toISOString().substring(0, 10).replace(/-/g, '')}`;
		dates.push({
			id: dateStr,
			desc: dateStr.replace(/(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})/, '$1-$2-$3 to $4-$5-$6'),
			epoch
		});

		currentDate.setUTCDate(currentDate.getUTCDate() + 7);
		epoch++;
	}
	return dates;
}

interface DataTableState {
	data: Record<string, unknown>; // Cache data by date range
	dateRanges: DateRange[] | null;
	dateRangesLastUpdated: Date | null;
	currentRange: string | null;
	loading: boolean;
	error: string | null;
	lastUpdated: Record<string, Date>;
}

function createDataTable() {
	const { subscribe, update } = writable<DataTableState>({
		data: {},
		dateRanges: null,
		dateRangesLastUpdated: null,
		currentRange: null,
		loading: false,
		error: null,
		lastUpdated: {}
	});

	// Cache expiration time (5 minutes)
	const CACHE_EXPIRATION = 5 * 60 * 1000;
	const inFlight = new Map<string, ReturnType<Response['json']>>();
	let dateRangesInFlight: Promise<DateRange[]> | null = null;
	let activeRequests = 0;
	let generation = 0;

	async function fetchDateRanges(forceRefresh = false) {
		if (dateRangesInFlight) return dateRangesInFlight;
		const store = get({ subscribe });

		// Return cached date ranges if they exist and aren't expired
		if (
			!forceRefresh &&
			store.dateRanges &&
			store.dateRangesLastUpdated &&
			Date.now() - store.dateRangesLastUpdated.getTime() < CACHE_EXPIRATION
		) {
			return store.dateRanges;
		}

		const requestGeneration = generation;
		const request = Promise.resolve()
			.then(async () => {
				try {
					const response = await fetch(`${config.proposalApiBaseUrl}`, { cache: 'no-store' });
					if (!response.ok) throw new Error(`Failed to fetch date ranges: HTTP ${response.status}`);
					const data = await response.json();

					const dates = buildDateRanges(new Date(data.max_timestamp));

					if (requestGeneration === generation) {
						update((state) => ({
							...state,
							dateRanges: dates,
							dateRangesLastUpdated: new Date()
						}));
					}

					return dates;
				} catch (error) {
					console.error('Error fetching date ranges:', error);
					throw error;
				}
			})
			.finally(() => {
				if (dateRangesInFlight === request) dateRangesInFlight = null;
			});
		dateRangesInFlight = request;
		return request;
	}

	async function getCurrentEpoch() {
		const dates = await fetchDateRanges();
		return dates[dates.length - 1].id;
	}

	async function fetchData(dateRange?: string) {
		const requestGeneration = generation;
		activeRequests++;
		update((state) => ({ ...state, loading: true, error: null }));
		try {
			const targetRange = dateRange || (await getCurrentEpoch());
			const pending = inFlight.get(targetRange);
			if (pending) return await pending;
			const store = get({ subscribe });
			const cachedData = store.data[targetRange];
			const lastUpdate = store.lastUpdated[targetRange];
			if (cachedData && lastUpdate && Date.now() - lastUpdate.getTime() < CACHE_EXPIRATION) {
				if (requestGeneration === generation) {
					update((state) => ({ ...state, currentRange: targetRange }));
				}
				return cachedData;
			}

			const request = Promise.resolve()
				.then(async () => {
					const [start, end] = targetRange.split('-');
					const startDate = `${start.substring(0, 4)}-${start.substring(4, 6)}-${start.substring(6, 8)}`;
					const endDate = `${end.substring(0, 4)}-${end.substring(4, 6)}-${end.substring(6, 8)}`;
					const url = `${config.proposalApiBaseUrl}?start=${startDate}&end=${endDate}`;
					const response = await fetch(url, { cache: 'no-store' });
					if (!response.ok) throw new Error(`Failed to fetch data: HTTP ${response.status}`);
					const data = await response.json();
					if (requestGeneration === generation) {
						update((state) => ({
							...state,
							data: { ...state.data, [targetRange]: data },
							currentRange: targetRange,
							lastUpdated: { ...state.lastUpdated, [targetRange]: new Date() }
						}));
					}
					return data;
				})
				.finally(() => {
					if (inFlight.get(targetRange) === request) inFlight.delete(targetRange);
				});
			if (requestGeneration === generation) inFlight.set(targetRange, request);
			return await request;
		} catch (error) {
			if (requestGeneration === generation) {
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'An error occurred'
				}));
			}
			throw error;
		} finally {
			if (requestGeneration === generation) {
				activeRequests--;
				update((state) => ({ ...state, loading: activeRequests > 0 }));
			}
		}
	}

	function clearCache() {
		// TASK-30: old requests may settle, but cannot restore cleared state.
		generation++;
		inFlight.clear();
		dateRangesInFlight = null;
		activeRequests = 0;
		update((state) => ({
			...state,
			data: {},
			loading: false,
			dateRanges: null,
			dateRangesLastUpdated: null,
			lastUpdated: {}
		}));
	}

	return {
		subscribe,
		fetchData,
		clearCache,
		fetchDateRanges
	};
}

export const dataTable = createDataTable();

// Derived stores
export const currentData = derived(dataTable, ($dataTable) =>
	$dataTable.currentRange ? $dataTable.data[$dataTable.currentRange] : null
);

export const dateRanges = derived(dataTable, ($dataTable) => $dataTable.dateRanges);

// Path: src/stores/dataTable.ts
