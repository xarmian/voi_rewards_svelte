<script lang="ts">
    import { TableHeadCell } from 'flowbite-svelte';
    import { AngleDownSolid, AngleUpSolid } from 'flowbite-svelte-icons';
    import { createEventDispatcher } from 'svelte';

    export let sortKey = '';
    export let sortDirection = 0;
    export let columnId: string;

    const dispatch = createEventDispatcher();

    function sortTable() {
        dispatch('sort', { sortKey: columnId });
    }

</script>

<TableHeadCell on:click={() => sortTable()} padding='px-2 py-2'>
    <div class="flex justify-between">
        <slot />
        {#if sortKey == columnId}
            {#if sortDirection == 1}
                <AngleDownSolid class="w-4 h-4 ml-1" />
            {:else if sortDirection == -1}
                <AngleUpSolid class="w-4 h-4 ml-1" />
            {/if}
        {/if}
    </div>
</TableHeadCell>

<style>
    div {
        cursor:default;
    }
</style>