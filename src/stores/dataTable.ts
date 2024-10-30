import { writable } from 'svelte/store';

export const rewardParams = writable({
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