<script lang="ts">
    import { TableBody, TableBodyCell, TableBodyRow, TableHead, TableSearch, Toast } from 'flowbite-svelte';
    import { onMount, onDestroy } from 'svelte';
    import { writable } from 'svelte/store';
    import RewardsTableHeader from './RewardsTableHeader.svelte';
    import { rewardParams } from '../../stores/dataTable';
	  import { CopySolid, LinkSolid } from 'flowbite-svelte-icons';
    import { copy } from 'svelte-copy';
    import { toast } from '@zerodevx/svelte-toast';
  
    export let items: any[] = [];

    $: totalBlockRewards = 0;
    $: totalHealthRewards = 0;
    $: totalHealthyNodes = 0;
    $: totalBlocks = 0;
    let unsubRewardParams: any;

    onMount(() => {
      const unsubRewardParams = rewardParams.subscribe((value) => {
        totalBlockRewards = value.block_reward_pool;
        totalHealthRewards = value.health_reward_pool;
        totalHealthyNodes = value.total_healthy_nodes;
        totalBlocks = value.total_blocks;

        if ($sortItems) {
          for (let i = 0; i < $sortItems.length; i++) {
            const item = $sortItems[i];
            $sortItems[i].block_rewards = Math.round(totalBlockRewards / totalBlocks * item.block_count * Math.pow(10,6)) / Math.pow(10,6);
            $sortItems[i].health_rewards = Math.round(totalHealthRewards / totalHealthyNodes * Math.pow(10,6)) / Math.pow(10,6);
            $sortItems[i].total_rewards = Math.round((item.block_rewards + item.health_rewards) * Math.pow(10,6)) / Math.pow(10,6);
            $sortItems = $sortItems;
          }
        }
      });
    });

    onDestroy(unsubRewardParams);

    let searchTerm: string = '';

    const handleSort = (event: any) => {
        sortTable(event.detail.sortKey);
    };

    const sortKey = writable('block_count'); // default sort key
    const sortDirection = writable(1); // default sort direction (descending)
    const sortItems = writable(items.slice()); // make a copy of the items array
  
    // Define a function to sort the items
    const sortTable = (key: any) => {
      // If the same key is clicked, reverse the sort direction
      if ($sortKey === key) {
        sortDirection.update((val) => -val);
      } else {
        sortKey.set(key);
        sortDirection.set(1);
      }
    };
  
    $: {
      const key = $sortKey;
      const direction = $sortDirection;
      const sorted = [...$sortItems].sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];
        if (aVal > bVal) {
          return -direction;
        } else if (aVal < bVal) {
          return direction;
        }
        return 0;
      });
      sortItems.set(sorted);
    }

    $: filterItems = $sortItems.filter((item) => item.proposer.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1);
    // $: pageItems = filterItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const columns = [
        { id: 'proposer', desc: 'Wallet' },
        { id: 'block_count', desc: 'Total Blocks' },
        { id: 'block_rewards', desc: 'Block Rewards' },
        { id: 'health_rewards', desc: 'Health Rewards' },
        { id: 'total_rewards', desc: 'Total Rewards' },
    ];

</script>
  
<TableSearch placeholder="Filter by wallet of NFD" hoverable={true} bind:inputValue={searchTerm}>
<TableHead>
    {#each columns as column}
        <RewardsTableHeader columnId={column.id} on:sort={handleSort} sortDirection={$sortDirection} sortKey={$sortKey}>
            {column.desc}
        </RewardsTableHeader>
    {/each}
</TableHead>
<TableBody tableBodyClass="divide-y">
    {#each filterItems as item}
    <TableBodyRow>
        <TableBodyCell class='whitespace-nowrap' title='{item.proposer}'>
          {item.proposer.substring(0,4)}...{item.proposer.substring(item.proposer.length-4)}
          <button use:copy={item.proposer} on:svelte-copy={() => toast.push(`Wallet Copied to Clipboard:<br/> ${item.proposer.substr(0,20)}...`)}>
            <CopySolid size='sm' class='inline' />
          </button> 
          <a href='https://voitest-explorer.k1-fi.a-wallet.net/explorer/account/{item.proposer}/transactions' target='_blank'>
            <LinkSolid size='sm' class='inline' />
          </a>
        </TableBodyCell>
        <TableBodyCell>{item.block_count}</TableBodyCell>
        <TableBodyCell>{item.block_rewards}</TableBodyCell>
        <TableBodyCell>{item.health_rewards}</TableBodyCell>
        <TableBodyCell>{item.total_rewards}</TableBodyCell>
    </TableBodyRow>
    {/each}
</TableBody>
</TableSearch>
{#if (toast)}
  <Toast dismissable={false} contentClass="flex space-x-4 divide-x divide-gray-200 dark:divide-gray-700">
    Address copied to clipboard!
  </Toast>
{/if}