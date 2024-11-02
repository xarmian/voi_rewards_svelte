import { writable } from 'svelte/store';

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

function createDataTable() {
    const { subscribe, set, update } = writable({
        data: [],
        columns: [],
        parameters: [],
        loading: false,
        error: null,
    });

    return { 
        subscribe, 
        set,
        update 
    };
}

export const dataTable = createDataTable();

// Path: src/stores/dataTable.ts