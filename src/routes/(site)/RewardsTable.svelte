<script lang="ts">
    import { Label, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableSearch, Toggle, Tooltip } from 'flowbite-svelte';
    import { onMount, onDestroy } from 'svelte';
    import { writable } from 'svelte/store';
    import RewardsTableHeader from './RewardsTableHeader.svelte';
    import { rewardParams } from '../../stores/dataTable';
	  import { CopySolid, LinkSolid } from 'flowbite-svelte-icons';
    import { Modal } from 'flowbite-svelte';
    import { copy } from 'svelte-copy';
    import { toast } from '@zerodevx/svelte-toast';
	  import { slide } from 'svelte/transition';
    import { getNFD } from '$lib/utils/nfd';
    //@ts-ignore
    import Device from 'svelte-device-info';
	  import WalletView from '../../views/WalletView.svelte';
    import { compareVersions } from 'compare-versions';

    $: MIN_ALGOD_VERSION = '3.0.0'; // default value for lowest possible epoch

    export let items: any[] = [];
    
    $: totalBlockRewards = 0;
    $: totalHealthRewards = 0;
    $: totalHealthyNodes = 0;
    $: totalBlocks = 0;
    $: totalExtraNodes = 0;

    let nfdData: any[] = [];
    let expandedRow: number | null = null;
    let showWalletNFD: boolean = true;
    let sortItems = writable<any[]>([]);
    let filterItems = <any[]>([]);
    let consensusData = <any[]>([]);
    
    let viewWallet = false;
    let viewWalletId = '';

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

      try {
        const response = await fetch('https://analytics.testnet.voi.nodly.io/v0/consensus/online');
        consensusData = await response.json();
      } catch (error) {
        console.error('Failed to fetch consensus data:', error);
      }
    });

    $: unsubRewardParams = rewardParams.subscribe(async (value) => {
      totalBlockRewards = value.block_reward_pool;
      totalHealthRewards = value.health_reward_pool;
      totalHealthyNodes = value.total_healthy_nodes;
      totalBlocks = value.total_blocks;
      totalExtraNodes = value.total_extra_nodes;
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
      const rows = filterItems.filter((row: { total_rewards: number; }) => row.total_rewards > 0);
      const data = rows.map((row: { proposer: any; block_rewards: any; health_rewards: any; total_rewards: any; }) => {
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
      const csvContent = headers.join(',') + '\n' + data.map((row: any[]) => row.join(',')).join('\n');

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
      // iterate through items and items.nodes and find the highest items.nodes.ver value, assign to MIN_ALGOD_VERSION
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.nodes) {
          for (let j = 0; j < item.nodes.length; j++) {
            const node = item.nodes[j];
            if (compareVersions(node.ver,MIN_ALGOD_VERSION) > 0) {
              MIN_ALGOD_VERSION = node.ver;
            }
          }
        }
      }
      if (compareVersions(MIN_ALGOD_VERSION,'3.21.0') == -1) MIN_ALGOD_VERSION = '3.18.0';

      sortItems = writable(items.slice()); // make a copy of the items array

      let blockTotal = 0;
      let healthTotal = 0;
      let totalRewardedNodes = totalHealthyNodes - totalExtraNodes;

      consensusData.map((row: any) => {
        const item = $sortItems.find((item) => item.proposer === row.addr);
        if (item) {
          item.key_active = row.key_active;
          item.key_voting = row.key_voting;
          item.key_expiring7d = row.key_expiring7d;
          item.expires_in_hrs = row.expires_in_hrs;
        }
      });

      for (let i = 0; i < $sortItems.length; i++) {
        const item = $sortItems[i];
        item.block_rewards = Math.floor(Math.ceil(totalBlockRewards / totalBlocks * item.block_count * Math.pow(10,7)) /10) / Math.pow(10,6);

        // iterate over item.nodes, and if the health_score is >= 5 add to health_rewards
        item.health_rewards = 0;
        if (item.nodes) {
          // sort elements in item.nodes from lowest health_divisor to highest
          item.nodes.sort((a: any, b: any) => a.health_divisor - b.health_divisor);

          // try to get the first index of an element in item.nodes with a health_score >= 5.0
          const healthyNodeIndex = item.nodes.findIndex((node: any) => node.health_score >= 5.0 && compareVersions(node.ver,MIN_ALGOD_VERSION) >= 0);
          if (healthyNodeIndex !== -1) {
            item.health_rewards += Math.floor(Math.ceil(totalHealthRewards / totalRewardedNodes / item.nodes[healthyNodeIndex].health_divisor * Math.pow(10,7)) / 10) / Math.pow(10,6);
          }
        }

        blockTotal += item.block_rewards;
        healthTotal += item.health_rewards;

        item.total_rewards = Math.round((item.block_rewards + item.health_rewards) * Math.pow(10,6)) / Math.pow(10,6);

        if (typeof item.nfd === 'undefined') {
          item.nfd = nfdData.find((nfd) => nfd.key === item.proposer)?.replacementValue;
        }
        if (typeof item.rank === 'undefined') {
          item.rank = i + 1;
        }

        $sortItems[i] = item;
      }

      /*// calculate the difference between totalBlockRewards and blockTotal, and add or subtract from the first X wallets
      let remain = totalBlockRewards - blockTotal;
      if (remain !== 0) {
        for (let i = 0; i < $sortItems.length; i++) {
          const item = $sortItems[i];
          const adj = remain/Math.abs(remain);
          item.block_rewards += adj;
          item.total_rewards += adj;
          $sortItems[i] = item;
          remain -= adj;
        }
      }

      // do the same for health rewards
      remain = totalHealthRewards - healthTotal;
      if (remain !== 0) {
        for (let i = 0; i < $sortItems.length; i++) {
          const item = $sortItems[i];
          const adj = remain/Math.abs(remain);
          item.health_rewards += adj;
          item.total_rewards += adj;
          $sortItems[i] = item;
          remain -= adj;
        }
      }*/

      const key = $sortKey;
      const direction = $sortDirection;
      let aVal, bVal;
      const sorted = [...$sortItems].sort((a, b) => {
        switch (key) {
          case 'proposer':
            aVal = a.nfd !== undefined ? a.nfd.toUpperCase() : a.proposer;
            bVal = b.nfd !== undefined ? b.nfd.toUpperCase() : b.proposer;
            break;
          case 'health_rewards':
            aVal = Number(a.nodes?.[0]?.health_score ?? 0);
            bVal = Number(b.nodes?.[0]?.health_score ?? 0);
            break;
          case 'status':
            aVal = Number(a.expires_in_hrs ?? 0);
            bVal = Number(b.expires_in_hrs ?? 0);
            break;
          case 'algod':
            //aVal = a.nodes[0]?.ver?.split('.').map(Number) ?? [-1];
            //bVal = b.nodes[0]?.ver?.split('.').map(Number) ?? [-1];
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

      filterItems = $sortItems.filter((item: { proposer: string; nfd: string | undefined; nodes: { node_name: string | null; }[]; }) => 
      (item.proposer.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1) 
      || (item.nfd !== undefined && item.nfd?.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1)
      || (item.nodes?.some((node: { node_name: string | null; }) => node.node_name !== null && node.node_name?.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1)));
    }

    let columns: any = [
        { id: 'rank', desc: 'Rank', tooltip: null },
        { id: 'proposer', desc: 'Wallet', tooltip: null },
    ];

    if (!Device.isMobile) {
      columns.push({ id: 'status', desc: 'Consensus', tooltip: 'Consensus Voting Status' });
      columns.push({ id: 'algod', desc: 'Algod', tooltip: 'Algod Node Version' });
      columns.push({ id: 'block_count', desc: 'Blocks', tooltip: 'Total blocks produced by each wallet during the Epoch' });
      columns.push({ id: 'block_rewards', desc: 'Block Rewards', tooltip: 'Total expected rewards based on blocks produced during the Epoch' });
      columns.push({ id: 'health_rewards', desc: 'Health Rewards', tooltip: 'Health rewards are distributed to all nodes with a Health Score of 5.0 or higher by the end of the Epoch.' });
    }

    columns.push({ id: 'total_rewards', desc: 'Total Rewards' });

</script>

<div class="overflow-auto {!Device.isMobile ? 'ml-6 mr-6' : ''}">
  <TableSearch placeholder="Filter by Wallet, NFD, or Node name" hoverable={true} bind:inputValue={searchTerm}>
  </TableSearch>
  <Table>
    <TableHead>
        {#each columns as column, i}
            <RewardsTableHeader columnId={column.id} on:sort={handleSort} sortDirection={$sortDirection} sortKey={$sortKey}>
                <span>
                  {#if column.id === 'proposer'}
                    <span class="inline-block negTranslate">{column.desc}</span>
                    <span class="inline-block ml-4" on:click|stopPropagation><Toggle bind:checked={showWalletNFD}>NFD</Toggle></span>
                  {:else}
                    {column.desc}
                  {/if}
                  {#if column.tooltip}
                    <i id="tooltip_{i}" class="fas fa-info-circle ml-2"></i>
                    <Tooltip defaultClass="py-2 px-3 text-sm font-medium w-64" triggeredBy="#tooltip_{i}" type="auto">{column.tooltip}</Tooltip>
                  {/if}
                </span>
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
              {#if item.expires_in_hrs <= 0}
                <i class="fas fa-ban text-red-500 ml-2" title="Consensus Participation Key has Expired"></i>
              {:else if item.key_expiring7d}
                <i class="fas fa-exclamation-triangle text-yellow-400 ml-2" title="Consensus Participation Key is Expiring Soon"></i>
              {/if}
            </TableBodyCell>
            <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium" title='{item.proposer}'>
              <button on:click|stopPropagation={() => {
                viewWallet = true;
                if (viewWalletId != item.proposer) viewWalletId = item.proposer;
              }} class="text-blue-500 hover:text-blue-800 hover:underline">
                {#if showWalletNFD && item.nfd !== undefined}
                  <span class='inline-block'>{item.nfd.length > 16 ? item.nfd.substring(0,16)+'...' : item.nfd}</span>
                {:else}
                  {item.proposer.substring(0,4)}...{item.proposer.substring(item.proposer.length-4)}
                {/if}
              </button>
              <button use:copy={item.proposer} on:click|stopPropagation on:svelte-copy={() => toast.push(`Wallet Copied to Clipboard:<br/> ${item.proposer.substr(0,20)}...`)}>
                <CopySolid size='sm' class='inline' />
              </button> 
              <a on:click|stopPropagation href='https://voi.observer/explorer/account/{item.proposer}/transactions' target='_blank'>
                <LinkSolid size='sm' class='inline' />
              </a>
            </TableBodyCell>
            {#if !Device.isMobile}
              <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">
                <div class="{(item.key_active && item.key_voting) ? 'text-green-500' : (item.key_active && !item.key_voting) ? 'text-red-500' : 'text-gray-500'}">
                  {item.key_active ? (item.key_voting ? 'Active/Voting' : 'Active/Not Voting') : 'Not Active/Not Voting'}
                </div>
                {#if item.expires_in_hrs <= 0}
                  <div class="text-red-500 bg-yellow-200 p-1 rounded-lg inline">Key Expired</div>
                {:else if item.key_expiring7d}
                  <div class="text-yellow-400" title="Participation key expires in {item.expires_in_hrs} hours">Key Expiring Soon</div>
                {/if}
                {#if $sortKey == 'status'}
                  {#if item.expires_in_hrs > 0}
                    <div class="text-gray-500" title="Participation key expires in {item.expires_in_hrs} hours">Expires in {item.expires_in_hrs} hours</div>
                  {:else if item.expires_in_hrs <= 0}
                    <div class="text-gray-500">Key Expired {-item.expires_in_hrs} hours ago</div>
                  {/if}
                {/if}
              </TableBodyCell>
              <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">
                <div class="{(item.nodes[0]?.ver < MIN_ALGOD_VERSION) ? 'text-red-500' : ''}">
                  {item.nodes[0]?.ver??''}
                </div>
              </TableBodyCell>
              <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">{item.block_count}</TableBodyCell>
                <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">{item.block_rewards}</TableBodyCell>
                <TableBodyCell tdClass="px-2 py-2 whitespace-nowrap font-medium">
                  <div>{item.health_rewards}</div>
                  {#if item.nodes && item.nodes.length > 0}
                    {#each item.nodes as node}
                    <div class="whitespace-nowrap flex" title="Node Name: {node.node_name}{'\r'}Health Score: {node.health_score}{'\r'}Health Divisor: {node.health_divisor}">
                      <div class="node_name truncate">{node.node_name}</div>
                      <div class='node_health'> - {node.health_score}</div>
                    </div>
                  {/each}
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
                    <a on:click|stopPropagation href='https://voi.observer/explorer/account/{item.proposer}/transactions' target='_blank'>
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
                    <Label defaultClass="text-sm font-medium inline-block w-28">Consensus:</Label>
                    <span>
                      <span class="{(item.key_active && item.key_voting) ? 'text-green-500' : (item.key_active && !item.key_voting) ? 'text-red-500' : 'text-gray-500'}">
                        {item.key_active ? (item.key_voting ? 'Active/Voting' : 'Active/Not Voting') : 'Not Active/Not Voting'}
                      </span>
                      {#if item.expires_in_hrs <= 0}
                        <span class="text-red-500 bg-yellow-200 p-1 rounded-lg inline">Key Expired</span>
                      {:else if item.key_expiring7d}
                        <span class="text-yellow-500">Key Expiring Soon</span>
                      {/if}
                    </span>
                  </div>
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
                {#each item.nodes as node}
                <div>
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Node ID:</Label>
                    <span>{node.node_host}</span>
                  </div>
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Node Name:</Label>
                    <span>{node.node_name}</span>
                  </div>
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Algod Version:</Label>
                    <span>{node.ver}</span>
                  </div>
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Health Score:</Label>
                    <span>{node.health_score}</span>
                  </div>
                  <div>
                    <Label defaultClass="text-sm font-medium inline-block w-28">Health Divisor:</Label>
                    <span>{node.health_divisor}</span>
                  </div>
                </div>
                {/each}
              </div>
            </TableBodyCell>
          </TableBodyRow>
        {/if}
      {/each}
      <TableBodyRow class="bg-gray-50 dark:bg-gray-900">
        <!-- show sum of rows for blocks, block rewards, health, and total columns using filterItems array -->
        <TableBodyCell colspan="{!Device.isMobile ? 4 : 2}" class="p-2">
          Totals:
        </TableBodyCell>
        {#if !Device.isMobile}
          <TableBodyCell class="p-2">
            {items.reduce((sum, item) => sum + item.block_count, 0)}
          </TableBodyCell>
          <TableBodyCell class="p-2">
            {Math.round(items.reduce((sum, item) => sum + item.block_rewards, 0))}
          </TableBodyCell>
          <TableBodyCell class="p-2">
            {Math.round(items.reduce((sum, item) => sum + item.health_rewards, 0))}
          </TableBodyCell>
        {/if}
        <TableBodyCell class="p-2">
          {Math.round(items.reduce((sum, item) => sum + item.block_rewards + item.health_rewards, 0))}
        </TableBodyCell>
      </TableBodyRow>
    </TableBody>
  </Table>
</div>
<Modal bind:open={viewWallet} autoclose size='lg' outsideclose>
  <WalletView walletId={viewWalletId}></WalletView>
</Modal>
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
  .negTranslate {
    transform: translateY(-6px);
  }
</style>