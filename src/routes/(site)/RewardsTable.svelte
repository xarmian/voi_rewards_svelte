<script lang="ts">
  import { Label, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableSearch, Toggle, Tooltip } from 'flowbite-svelte';
  import { onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';
  import RewardsTableHeader from './RewardsTableHeader.svelte';
  import { rewardParams } from '../../stores/dataTable';
  import { FileCopySolid, StarSolid, StarOutline, WalletSolid } from 'flowbite-svelte-icons';
  import { Modal } from 'flowbite-svelte';
  import { copy } from 'svelte-copy';
  import { toast } from '@zerodevx/svelte-toast';
  import { slide } from 'svelte/transition';
  import WalletView from '../../views/WalletView.svelte';
  import { compareVersions } from 'compare-versions';
  import { favorites } from '../../stores/favorites';
  import { getAccountInfo, getNFDomains } from '$lib/stores/accounts';
  import type { NFDomainResponse } from '$lib/stores/accounts';
	import { goto } from '$app/navigation';
  import { nicknames } from '$lib/stores/nicknames';
  import NicknameManager from '$lib/components/NicknameManager.svelte';
  import CopyComponent from '$lib/component/ui/CopyComponent.svelte';
  
  export let items: any[] = [];
  export let refreshData: () => Promise<void>; // Add this line to accept the refresh function as a prop

  $: totalBlockRewards = 0;
  $: totalBlocks = 0;
  $: rewardPerBlock = 0;
  $: selectedBalance = 'Loading...' as string | number;

  let nfdData: Record<string, NFDomainResponse | null> = {};
  let expandedRow: number | null = null;
  let showWalletNFD: boolean = true;
  let sortItems = writable<any[]>([]);
  let filterItems: any[] = [];
  
  let viewWallet = false;
  let viewWalletId = '';

  let currentPage = 1;
  let itemsPerPage = 20;

  let isRefreshing = false;
  let lastUpdateTime: Date | null = null;

  let showOnlyFavorites = false;

  async function handleRefresh() {
    isRefreshing = true;
    try {
      await refreshData();
      lastUpdateTime = new Date();
    } catch (error) {
      console.error('Failed to refresh data:', error);
      toast.push('Failed to refresh data. Please try again.');
    } finally {
      isRefreshing = false;
    }
  }

  const toggleRow = async (row: number) => {
    if (expandedRow === row) {
      expandedRow = null;
    } else {
      expandedRow = row;

      selectedBalance = 'Loading...';
      // find row in filterItems, using currentPage and itemsPerPage
      const index = (currentPage - 1) * itemsPerPage + row;
      if (filterItems[index]) {
        updateSelectedBalance(index);
      }
    }
  }

  const updateSelectedBalance = async (row: number) => {
    const accountInfo = await getAccountInfo(filterItems[row].proposer);
    selectedBalance = (Number(accountInfo?.amount??0) / Math.pow(10,6));
  }

  onMount(async () => {
    lastUpdateTime = new Date();
    // convert to NFDs
    const allAddresses = items.map((row: any) => row.proposer);
    nfdData = await getNFDomains(allAddresses);
  });

  $: unsubRewardParams = rewardParams.subscribe(async (value) => {
    totalBlockRewards = value.block_reward_pool;
    totalBlocks = value.total_blocks;
    rewardPerBlock = value.reward_per_block;
  });

  $: onDestroy(unsubRewardParams);

  let searchTerm: string = '';

  const handleSort = (event: any) => {
      sortTable(event.detail.sortKey);
  };

  const sortKey = writable('block_count'); // default sort key
  const sortDirection = writable(1); // default sort direction (descending)

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
    const data = filterItems.map((row: { proposer: any; block_rewards: any; }) => {
      return [row.proposer, row.block_rewards];
    });

    // Create the CSV content
    const headers = ['account', 'block_rewards'];
    const csvContent = headers.join(',') + '\n' + data.map((row: any[]) => row.join(',')).join('\n');

    // Download the CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = 'phase2_rewards.csv';
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  $: {
    sortItems = writable(items.slice()); // make a copy of the items array

    for (let i = 0; i < $sortItems.length; i++) {
      const item = $sortItems[i];
      item.epoch_block_rewards = Math.floor(Math.floor(totalBlockRewards / totalBlocks * item.block_count * Math.pow(10,7)) /10) / Math.pow(10,6);
      item.block_rewards = item.block_count * rewardPerBlock;

      item.total_rewards = Math.round((item.block_rewards + item.health_rewards) * Math.pow(10,6)) / Math.pow(10,6);

      if (typeof item.nfd === 'undefined') {
        item.nfd = nfdData[item.proposer]?.name;
      }
      if (typeof item.rank === 'undefined') {
        item.rank = i + 1;
      }

      $sortItems[i] = item;
    }

    const key = $sortKey;
    const direction = $sortDirection;
    let aVal, bVal;
    const sorted = [...$sortItems].sort((a, b) => {
      switch (key) {
        case 'proposer':
          aVal = a.nfd !== undefined ? a.nfd.toUpperCase() : a.proposer;
          bVal = b.nfd !== undefined ? b.nfd.toUpperCase() : b.proposer;
          break;
        case 'status':
          aVal = Number(a.expires_in_hrs ?? 0);
          bVal = Number(b.expires_in_hrs ?? 0);
          break;
        case 'algod':
          aVal = a.nodes[0]?.ver??'0.0.0';
          bVal = b.nodes[0]?.ver??'0.0.0';
          return compareVersions(aVal,bVal) * -direction;
          break;
        default:
          aVal = a[key];
          bVal = b[key];
      }
      return (aVal < bVal) ? direction : (aVal > bVal) ? -direction : 0;
    });
    sortItems.set(sorted);

    filterItems = $sortItems.filter((item: { proposer: string; nfd: string | undefined; nodes: { node_name: string | null; }[]; }) => {
      const matchesSearch = (
        item.proposer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.nfd !== undefined && item.nfd?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        ($nicknames[item.proposer]?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.nodes?.some((node: { node_name: string | null; }) => 
          node.node_name !== null && 
          node.node_name?.toLowerCase().includes(searchTerm.toLowerCase())
        ))
      );

      const matchesFavorites = !showOnlyFavorites || $favorites.includes(item.proposer);

      return matchesSearch && matchesFavorites;
    });

    if (filterItems.length > 0 && expandedRow != null) {
      // find row in filterItems, using currentPage and itemsPerPage
      const index = (currentPage - 1) * itemsPerPage + expandedRow;
      updateSelectedBalance(index);
    }

    // get page of items
    //const pageOfItems = filterItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    //const allAddresses = pageOfItems.map((item: any) => item.proposer);
    /*(async () => {
      const nfdData = await getNFDomains(allAddresses);
      pageOfItems.forEach((item: any) => {
        item.nfd = nfdData[item.proposer]?.name;
      });
    })();*/
  }

  let columns: any = [
      { id: 'rank', desc: 'Rank', tooltip: null },
      { id: 'proposer', desc: 'Address', tooltip: null },
  ];

  columns.push({ id: 'block_count', desc: 'Blocks', tooltip: 'Total blocks produced by each wallet so far this Epoch' });
  columns.push({ id: 'block_rewards', desc: 'Est. Earned Reward', tooltip: 'Estimated block rewards earned by each wallet so far this Epoch' });
</script>

<div class="overflow-auto ml-0 mr-0 md:ml-6 md:mr-6 flex flex-col">
    <div class="flex justify-between items-center gap-4">
      <div class="flex flex-col md:flex-row items-center gap-4 flex-1">
        <TableSearch placeholder="Filter by Address or enVoi name" hoverable={true} bind:inputValue={searchTerm} innerDivClass="w-full" inputClass="w-64 sm:w-80 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 ps-10 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" />
        <div class="flex items-center gap-2">
          <Toggle bind:checked={showOnlyFavorites}>
            <StarSolid class="w-4 h-4 text-yellow-300" />
            Favorites Only
          </Toggle>
        </div>
      </div>
      <button
        on:click={handleRefresh}
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center"
        disabled={isRefreshing}
      >
        <i class="fas fa-sync-alt mr-2 {isRefreshing ? 'animate-spin' : ''}"></i>
        <span class="hidden md:block">Refresh</span>
      </button>
    </div>
    {#if lastUpdateTime}
      <p class="text-sm text-gray-600 mb-2 place-self-end">
        Last updated: {lastUpdateTime.toLocaleString()}
      </p>
    {/if}
  <Table>
    <TableHead>
        {#each columns as column, i}
            <RewardsTableHeader columnId={column.id} on:sort={handleSort} sortDirection={$sortDirection} sortKey={$sortKey}>
                <span class="flex flex-col md:flex-row items-center">
                  {#if column.id === 'proposer'}
                    <span>{column.desc}</span>
                    <button 
                      class="md:ml-4" 
                      on:click|stopPropagation 
                      aria-label="Show ENS"
                    >
                      <Toggle bind:checked={showWalletNFD}>enVoi</Toggle>
                    </button>
                  {:else}
                    {column.desc}
                  {/if}
                  {#if column.tooltip}
                    <i id="tooltip_{i}" class="fas fa-info-circle ml-2"></i>
                    <Tooltip defaultClass="py-2 px-3 text-sm font-medium w-64" triggeredBy="#tooltip_{i}" type="auto">{column.tooltip}</Tooltip>
                  {/if}
                </span>
                {#if column.id === 'block_rewards' || column.id === 'health_points' || column.id === 'total_rewards'}
                  <button title='Download CSV' class='ml-2 fas fa-download' on:click|stopPropagation={() => downloadCSV(column.id)} aria-label="Download CSV"></button>
                {/if}
            </RewardsTableHeader>
        {/each}
    </TableHead>
    <TableBody tableBodyClass="divide-y">
        {#each filterItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage) as item, i}
        <TableBodyRow on:click={() => toggleRow(i)}>
            <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">
              <button 
                on:click|stopPropagation={() => favorites.toggle(item.proposer)}
                class="mr-2 hover:scale-110 transition-transform"
              >
                {#if $favorites.includes(item.proposer)}
                  <StarSolid class="w-4 h-4 text-yellow-300" />
                {:else}
                  <StarOutline class="w-4 h-4" />
                {/if}
              </button>
              {item.rank}
              {#if item.expires_in_hrs <= 0}
                <i class="fas fa-ban text-red-500 ml-2" title="Consensus Participation Key has Expired"></i>
              {:else if item.key_expiring7d}
                <i class="fas fa-exclamation-triangle text-yellow-400 ml-2" title="Consensus Participation Key is Expiring Soon"></i>
              {/if}
            </TableBodyCell>
            <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium" title='{item.proposer}'>
              <div class="flex justify-between items-center gap-2">
                <button 
                  on:click|stopPropagation={() => goto(`/wallet/${item.proposer}`)}
                  class="hover:text-blue-600 transition-colors flex items-center gap-2"
                >
                  {#if $nicknames[item.proposer]}
                    <span class='inline-block'>{$nicknames[item.proposer]}</span>
                  {:else if showWalletNFD && item.nfd !== undefined}
                    <span class='inline-block'>{item.nfd.length > 16 ? item.nfd.substring(0,10)+'...' : item.nfd}</span>
                  {:else}
                    {item.proposer.substring(0,4)}...{item.proposer.substring(item.proposer.length-4)}
                  {/if}
                  <WalletSolid size="sm" class="text-gray-400 group-hover:text-blue-600" />
                </button>
                
                <div class="flex items-center gap-2">
                  <button
                      on:click|stopPropagation={() => {
                      const row = filterItems[i];
                      row.showNicknameInput = !row.showNicknameInput;
                      filterItems = filterItems;
                    }}
                    class="text-gray-500 hover:text-gray-600 px-2"
                    title="Set Nickname"
                    aria-label="Set Nickname"
                  >
                    <i class="fas fa-tag"></i>
                  </button>

                  <button
                    on:click|stopPropagation={() => {
                      viewWallet = true;
                      if (viewWalletId != item.proposer) viewWalletId = item.proposer;
                    }}
                    class="inline-flex items-center gap-1 px-2 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
                    title="Quick View"
                    aria-label="Quick View"
                  >
                    <i class="fas fa-expand-alt"></i>
                  </button>
                </div>
              </div>
              
              {#if item.showNicknameInput}
              <button 
                class="mt-2" 
                on:click|stopPropagation 
                aria-label="Set Nickname"
              >
                  <NicknameManager 
                    address={item.proposer} 
                    bind:showInput={item.showNicknameInput}
                  />
              </button>
              {/if}
            </TableBodyCell>
            <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">{(item.block_count)}</TableBodyCell>
            <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">{(item.block_rewards.toFixed(2))} VOI</TableBodyCell>
        </TableBodyRow>
        {#if expandedRow === i}
          <TableBodyRow>
            <TableBodyCell colspan={4} class="p-0" on:click={() => toggleRow(i)}>
              <div class="px-2 py-3 m-4" transition:slide={{ duration: 300, axis: 'y' }}>
                <div class="space-y-3">
                  <!-- address and nfd -->
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-40">Address:</Label>
                    <button on:click|stopPropagation={() => goto(`/wallet/${item.proposer}`)} class="text-blue-500 hover:text-blue-600 underline">{item.proposer}</button>
                    
                    <!-- Action buttons group -->
                    <div class="mt-2 flex gap-2">
                      <CopyComponent
                        text={item.proposer}
                        toastMessage={`Wallet Copied to Clipboard:<br/> ${item.proposer.substr(0,20)}...`}
                        failureMessage={`Failed to copy wallet address to clipboard.`}
                      >
                        <span class="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors">
                          <FileCopySolid size="sm" />
                          Copy Address
                        </span>
                      </CopyComponent>

                      <button 
                        on:click|stopPropagation={() => {
                          viewWallet = true;
                          if (viewWalletId != item.proposer) viewWalletId = item.proposer;
                        }}
                        class="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      >
                        <i class="fas fa-expand-alt"></i>
                        Quick View
                      </button>

                      <a 
                        href="https://explorer.voi.network/explorer/account/{item.proposer}/transactions"
                        target="_blank"
                        class="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        on:click|stopPropagation
                      >
                        <i class="fas fa-search"></i>
                        View in Explorer
                      </a>
                    </div>
                  </div>

                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-40">Account Balance:</Label>
                    <span class="text-gray-600 dark:text-gray-400">{selectedBalance.toLocaleString()} VOI</span>
                  </div>

                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-40">Est. Reward (full epoch):</Label>
                    <span class="text-gray-600 dark:text-gray-400">{(item.epoch_block_rewards).toLocaleString()} VOI</span>
                  </div>

                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-40">Est. APR:</Label>
                    <span class="text-gray-600 dark:text-gray-400">{(item.epoch_block_rewards / Number(selectedBalance) * 52 * 100).toFixed(2)}%</span>
                  </div>

                  {#if item.nfd}
                    <div>
                      <Label defaultClass="text-sm font-medium inline-block w-40">ENS:</Label>
                      <a 
                        href="https://app.envoi.sh/#/{item.nfd}" 
                        target="_blank" 
                        class="text-blue-500 hover:text-blue-700 hover:underline"
                        on:click|stopPropagation
                      >
                        {item.nfd}
                      </a>
                    </div>
                  {/if}
                </div>
              </div>
            </TableBodyCell>
          </TableBodyRow>
        {/if}
      {/each}
   
      <TableBodyRow class="bg-gray-50 dark:bg-gray-900">
        <!-- show sum of rows for blocks, block rewards, health, and total columns using filterItems array -->
        <TableBodyCell colspan={2} class="p-2">
          Blocks:
        </TableBodyCell>
          <TableBodyCell class="p-2">
            {filterItems.reduce((sum, item) => sum + item.block_count, 0)}
          </TableBodyCell>
          <TableBodyCell colspan={1} class="p-2">
            {Math.round(filterItems.reduce((sum, item) => sum + item.block_rewards, 0)).toLocaleString()} VOI
          </TableBodyCell>
      </TableBodyRow>
    </TableBody>
  </Table>
  <div class="flex justify-between items-center gap-4">
    <button
      class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      on:click={() => currentPage = Math.max(1, currentPage - 1)}
      disabled={currentPage === 1}
    >
      Previous
    </button>
    <div class="flex items-center gap-2">
      <span>Page</span>
      <input
        type="number"
        bind:value={currentPage}
        min="1"
        max={Math.ceil(filterItems.length / itemsPerPage)}
        class="w-16 px-2 py-1 border rounded text-center text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-800"
        on:change={(e) => {
          const value = parseInt(e.currentTarget.value);
          const maxPage = Math.ceil(filterItems.length / itemsPerPage);
          if (value < 1) currentPage = 1;
          else if (value > maxPage) currentPage = maxPage;
          else currentPage = value;
        }}
      />
      <span>of {Math.ceil(filterItems.length / itemsPerPage)}</span>
    </div>
    <button
      class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      on:click={() => currentPage = Math.min(Math.ceil(filterItems.length / itemsPerPage), currentPage + 1)}
      disabled={currentPage * itemsPerPage >= filterItems.length}
    >
      Next
    </button>
  </div>
</div>
<Modal bind:open={viewWallet} autoclose size='lg' outsideclose class="bg-gray-100 dark:bg-black rounded-xl shadow-lg transition-all duration-300 w-full max-w-4xl mx-auto border-2 border-gray-300">
  <WalletView walletId={viewWalletId}></WalletView>
</Modal>
<style>
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
