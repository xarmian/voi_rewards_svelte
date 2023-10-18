import { writable } from 'svelte/store';

export const rewardParams = writable({
    block_reward_pool: 0,
    health_reward_pool: 0,
    total_blocks: 0,
    total_healthy_nodes: 0
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