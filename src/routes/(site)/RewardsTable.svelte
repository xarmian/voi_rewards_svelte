<script lang="ts">
    import { Label, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableSearch } from 'flowbite-svelte';
    import { onMount, onDestroy } from 'svelte';
    import { writable } from 'svelte/store';
    import RewardsTableHeader from './RewardsTableHeader.svelte';
    import { rewardParams } from '../../stores/dataTable';
	  import { CopySolid, LinkSolid } from 'flowbite-svelte-icons';
    import { copy } from 'svelte-copy';
    import { toast } from '@zerodevx/svelte-toast';
	  import { slide } from 'svelte/transition';
    //@ts-ignore
    import Device from 'svelte-device-info';

    export let items: any[] = [];

    $: totalBlockRewards = 0;
    $: totalHealthRewards = 0;
    $: totalHealthyNodes = 0;
    $: totalBlocks = 0;
    $: unsubRewardParams = function() {};

    let nfdData: any[] = [];
    let expandedRow: number | null = null;

    const toggleRow = (row: number) => {
      if (expandedRow === row) {
        expandedRow = null;
      } else {
        expandedRow = row;
      }
    }

    onMount(async () => {
      // convert to NFDs
      const allAddresses = items.map((row: any) => row.proposer);
      nfdData = await getNFD(allAddresses);

      unsubRewardParams = rewardParams.subscribe(async (value) => {
        totalBlockRewards = value.block_reward_pool;
        totalHealthRewards = value.health_reward_pool;
        totalHealthyNodes = value.total_healthy_nodes;
        totalBlocks = value.total_blocks;

        if ($sortItems) {
          for (let i = 0; i < $sortItems.length; i++) {
            const item = $sortItems[i];
            item.block_rewards = Math.round(totalBlockRewards / totalBlocks * item.block_count * Math.pow(10,6)) / Math.pow(10,6);
            item.health_rewards = (item.node && item.node.health_score >= 5.0) ? Math.round(totalHealthRewards / totalHealthyNodes / item.node.health_divisor * Math.pow(10,6)) / Math.pow(10,6) : 0;
            item.total_rewards = Math.round((item.block_rewards + item.health_rewards) * Math.pow(10,6)) / Math.pow(10,6);
            if (typeof item.nfd === 'undefined') {
              item.nfd = nfdData.find((nfd) => nfd.key === item.proposer)?.replacementValue;
            }
            if (typeof item.rank === 'undefined') {
              item.rank = i + 1;
            }
            $sortItems[i] = item;
          }
          
          $sortItems = $sortItems;
        }
      });

    });

    $: onDestroy(unsubRewardParams);

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
        if (key == 'proposer') {
          const aVal = a.nfd !== undefined ? a.nfd.toUpperCase() : a.proposer;
          const bVal = b.nfd !== undefined ? b.nfd.toUpperCase() : b.proposer;
          if (aVal > bVal) {
            return -direction;
          } else if (aVal < bVal) {
            return direction;
          }
          return 0;
        }

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

    $: filterItems = $sortItems.filter((item) => 
      (item.proposer.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1) 
      || (item.nfd !== undefined && item.nfd?.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1)
      || (item.node?.node_name !== null && item.node?.node_name?.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1));
    // $: pageItems = filterItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    let columns = [
        { id: 'rank', desc: 'Rank' },
        { id: 'proposer', desc: 'Wallet' },
    ];

    if (!Device.isMobile) {
      columns.push({ id: 'block_count', desc: 'Total Blocks' });
      columns.push({ id: 'block_rewards', desc: 'Block Rewards' });
      columns.push({ id: 'health_rewards', desc: 'Health Rewards' });
    }

    columns.push({ id: 'total_rewards', desc: 'Total Rewards' });

</script>

<div class="overflow-auto {!Device.isMobile ? 'ml-6 mr-6' : ''}">
  <TableSearch placeholder="Filter by Wallet, NFD, or Node name" hoverable={true} bind:inputValue={searchTerm}></TableSearch>
  <Table>
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
        {#each filterItems as item, i}
        <TableBodyRow on:click={() => toggleRow(i)}>
            <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">
              {item.rank}
            </TableBodyCell>
            <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium" title='{item.proposer}'>
              {#if item.nfd !== undefined}
                <span class='inline-block'>{item.nfd.length > 16 ? item.nfd.substring(0,16)+'...' : item.nfd}</span>
              {:else}
                {item.proposer.substring(0,4)}...{item.proposer.substring(item.proposer.length-4)}
              {/if}
              <button use:copy={item.proposer} on:click|stopPropagation on:svelte-copy={() => toast.push(`Wallet Copied to Clipboard:<br/> ${item.proposer.substr(0,20)}...`)}>
                <CopySolid size='sm' class='inline' />
              </button> 
              <a on:click|stopPropagation href='https://voitest-explorer.k1-fi.a-wallet.net/explorer/account/{item.proposer}/transactions' target='_blank'>
                <LinkSolid size='sm' class='inline' />
              </a>
            </TableBodyCell>
            {#if !Device.isMobile}
              <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">{item.block_count}</TableBodyCell>
              <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">{item.block_rewards}</TableBodyCell>
              <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">
                <div>{item.health_rewards}</div>
                {#if item.node && item.node != null && item.node.health_score != null}
                  <div class="whitespace-nowrap flex" title="Node Name: {item.node.node_name}{'\r'}Health Score: {item.node.health_score}{'\r'}Health Divisor: {item.node.health_divisor}">
                    <div class="node_name truncate">{item.node.node_name}</div>
                    <div class='node_health'> - {item.node.health_score}</div>
                  </div>
                {:else}
                  <div style='font-size:10px'>(No Telemetry Data)</div>
                {/if}
              </TableBodyCell>
            {/if}
            <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">{item.total_rewards}</TableBodyCell>
        </TableBodyRow>
        {#if expandedRow === i}
          <TableBodyRow>
            <TableBodyCell colspan={Device.isMobile ? 3 : 6} class="p-0" on:click={() => toggleRow(i)}>
              <div class="px-2 py-3 m-4" transition:slide={{ duration: 300, axis: 'y' }}>
                <div>
                  <!-- address and nfd -->
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Wallet:</Label>
                    <a on:click|stopPropagation href='https://voitest-explorer.k1-fi.a-wallet.net/explorer/account/{item.proposer}/transactions' target='_blank'>
                      {Device.isMobile ? item.proposer.substring(0,20) : item.proposer}...
                    </a>
                  </div>
                  {#if item.nfd}
                    <div>
                      <Label defaultClass="text-sm font-medium inline-block w-28">NFD:</Label>
                      <a on:click|stopPropagation href="https://app.nf.domains/name/{item.nfd}" target="_blank" class="hover:underline active:text-gray-500">{item.nfd}</a>
                    </div>
                  {/if}
                </div>
                <br/>
                {#if Device.isMobile}
                <div>
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Total Blocks:</Label>
                    <span>{item.block_count}</span>
                  </div>
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Block Rewards:</Label>
                    <span>{item.block_rewards}</span>
                  </div>
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Health Rewards:</Label>
                    <span>{item.health_rewards}</span>
                  </div>
                </div>
                {/if}
                <div>
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Node Name:</Label>
                    <span>{item.node.node_name}</span>
                  </div>
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Health Score:</Label>
                    <span>{item.node.health_score}</span>
                  </div>
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Health Divisor:</Label>
                    <span>{item.node.health_divisor}</span>
                  </div>
                </div>
              </div>
            </TableBodyCell>
          </TableBodyRow>
        {/if}
      {/each}
    </TableBody>
  </Table>
</div>
<style>
  .node_name {
    max-width: 200px;
  }
  a {
    color: #007bff;
    text-decoration: none;
    background-color: transparent;
  }
  a:hover {
    text-decoration: underline;
  }

  a:active {
    color: #6b7280;
  }
</style>