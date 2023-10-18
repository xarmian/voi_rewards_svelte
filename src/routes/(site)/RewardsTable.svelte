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

    let nfdData: any[] = [];

    onMount(async () => {
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

      // convert to NFDs
      const allAddresses = items.map((row: any) => row.proposer);
      nfdData = await getNFD(allAddresses);
    });

    onDestroy(unsubRewardParams);

    async function getNFD(data: any) {
        const aggregatedNFDs: any[] = [];
        let addressChunks = [];
        let chunkSize = 20;

        for (let i = 0; i < data.length; i += chunkSize) {
            addressChunks.push(data.slice(i, i + chunkSize));
        }

        const allFetches = addressChunks.map((addressChunk, index) => {
            let url = "https://api.nf.domains/nfd/lookup?";
            let params = new URLSearchParams();

            addressChunk.forEach((address: string) => {
                params.append("address", address);
            });

            params.append("view", "tiny");
            params.append("allowUnverified", "true");

            url += params.toString();

            return fetch(url)
                .then(response => response.json())
                .then(additionalData => {
                    Object.entries(additionalData).forEach((val) => {
                        const key = val[0];
                        const value: any = val[1];

                        const replacementValue = value.name;
                        aggregatedNFDs.push({ key, replacementValue });
                    });
                })
                .catch(error => {}); // suppress error //console.error("Error fetching additional data:", error));
        });

        await Promise.all(allFetches);
        return aggregatedNFDs;
    }

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

    function downloadCSV(type = 'all') {
      //if (typeof event !== 'undefined') event.stopPropagation(); // Stop event propagation

      // Get the table data
      const rows = filterItems.filter(row => row.total_rewards > 0);
      const data = rows.map(row => {
        const address = row.proposer;
        let tokenAmount;
        let note;
        if (type === 'block_rewards') {
          tokenAmount = row.block_rewards;
          note = JSON.stringify({blockRewards: tokenAmount});
        } else if (type === 'health_rewards') {
          tokenAmount = row.health_rewards;
          note = JSON.stringify({healthRewards: tokenAmount});
        } else {
          tokenAmount = row.total_rewards;
          note = JSON.stringify({blockRewards: row.block_rewards, healthRewards: row.health_rewards});
        }
        note = '"' + note.replace(/"/g, '""') + '"';
        tokenAmount = Math.round(tokenAmount * Math.pow(10,6));

        return [address, 'node', tokenAmount, note];
      });

      // Create the CSV content
      const headers = ['account', 'userType', 'tokenAmount', 'note'];
      const csvContent = headers.join(',') + '\n' + data.map(row => row.join(',')).join('\n');

      // Download the CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      const filename = type === 'block_rewards' ? 'block_rewards.csv' : type === 'health_rewards' ? 'health_rewards.csv' : 'all_rewards.csv';
      link.setAttribute('download', filename);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  
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
            {#if column.id === 'block_rewards' || column.id === 'health_rewards' || column.id === 'total_rewards'}
              <button title='Download CSV' class='ml-2 fas fa-download' on:click|stopPropagation={() => downloadCSV(column.id)}></button>
            {/if}
        </RewardsTableHeader>
    {/each}
</TableHead>
<TableBody tableBodyClass="divide-y">
    {#each filterItems as item}
    <TableBodyRow>
        <TableBodyCell class='whitespace-nowrap' title='{item.proposer}'>
          {#if nfdData.find((nfd) => nfd.key === item.proposer)}
            {nfdData.find((nfd) => nfd.key === item.proposer).replacementValue}
          {:else}
            {item.proposer.substring(0,4)}...{item.proposer.substring(item.proposer.length-4)}
          {/if}
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