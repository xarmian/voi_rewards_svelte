import { writable, derived, get } from 'svelte/store';
import { config } from '$lib/config';

interface RewardParams {
  block_reward_pool: number;
  total_blocks: number;
  reward_per_block: number;
  total_blocks_projected: number;
}

export const rewardParams = writable<RewardParams>({
  block_reward_pool: 0,
  total_blocks: 0,
  reward_per_block: 0,
  total_blocks_projected: 0
});

interface DateRange {
  id: string;
  desc: string;
  epoch: number;
}

interface DataTableState {
  data: Record<string, unknown>;  // Cache data by date range
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

  async function fetchDateRanges(forceRefresh = false) {
    const store = get({ subscribe });
    
    // Return cached date ranges if they exist and aren't expired
    if (!forceRefresh && 
        store.dateRanges && 
        store.dateRangesLastUpdated && 
        (Date.now() - store.dateRangesLastUpdated.getTime() < CACHE_EXPIRATION)) {
      return store.dateRanges;
    }

    try {
      const response = await fetch(`${config.proposalApiBaseUrl}`, { cache: 'no-store' });
      const data = await response.json();
      
      const minTimestamp = new Date('2024-10-30T00:00:00Z');
      const maxTimestamp = new Date(data.max_timestamp);
      
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

      // Update the store with new date ranges
      update(state => ({
        ...state,
        dateRanges: dates,
        dateRangesLastUpdated: new Date()
      }));

      return dates;
    } catch (error) {
      console.error('Error fetching date ranges:', error);
      throw error;
    }
  }

  async function getCurrentEpoch() {
    const dates = await fetchDateRanges();
    return dates[dates.length - 1].id;
  }

  async function fetchData(dateRange?: string) {
    const store = get({ subscribe });
    
    if (store.loading) return;

    try {
      update(state => ({ ...state, loading: true, error: null }));

      // If no date range provided, get current epoch
      const targetRange = dateRange || await getCurrentEpoch();

      // Check if we have cached data that isn't expired
      const cachedData = store.data[targetRange];
      const lastUpdate = store.lastUpdated[targetRange];
      if (cachedData && lastUpdate && (Date.now() - lastUpdate.getTime() < CACHE_EXPIRATION)) {
        update(state => ({
          ...state,
          currentRange: targetRange,
          loading: false
        }));
        return cachedData;
      }

      // Parse date range and fetch data
      const [start, end] = targetRange.split('-');
      const startDate = `${start.substring(0, 4)}-${start.substring(4, 6)}-${start.substring(6, 8)}`;
      const endDate = `${end.substring(0, 4)}-${end.substring(4, 6)}-${end.substring(6, 8)}`;
      
      const url = `${config.proposalApiBaseUrl}?start=${startDate}&end=${endDate}`;
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json();

      update(state => ({
        ...state,
        data: { ...state.data, [targetRange]: data },
        currentRange: targetRange,
        loading: false,
        lastUpdated: { ...state.lastUpdated, [targetRange]: new Date() }
      }));

      return data;

    } catch (error) {
      update(state => ({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : 'An error occurred'
      }));
      throw error;
    }
  }

  function clearCache() {
    update(state => ({
      ...state,
      data: {},
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
export const currentData = derived(
  dataTable,
  $dataTable => $dataTable.currentRange ? $dataTable.data[$dataTable.currentRange] : null
);

export const dateRanges = derived(
  dataTable,
  $dataTable => $dataTable.dateRanges
);

// Path: src/stores/dataTable.ts