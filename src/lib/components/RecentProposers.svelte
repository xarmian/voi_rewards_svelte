<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { fade } from 'svelte/transition';
  import { config } from '../config';
  const dispatch = createEventDispatcher();

  interface Proposer {
    address: string;
    timestamp: string;
    block: number;
    votes: number;
  }

  export let ballasts: string[] = [];
  let proposers: Proposer[] = [];
  let intervalId: NodeJS.Timeout;
  let isLoaded = false;
  let processedBlocks = new Set<number>();

  async function fetchRecentProposers() {
    try {
      const response = await fetch(`${config.proposalApiBaseUrl}?action=recent`);
      const data = await response.json();
      
      const newProposers = data.slice(0, 10).map((p: any) => ({
        address: p.proposer,
        timestamp: new Date(p.timestamp).toLocaleString(),
        block: p.block,
        votes: p.votes
      }));

      // Count new non-Ballast blocks that haven't been processed before
      const newNonBallastBlocks = newProposers.filter((p: Proposer) => 
        !ballasts.includes(p.address) && !processedBlocks.has(p.block)
      ).length;

      // Update the set of processed blocks
      newProposers.forEach((p: Proposer) => processedBlocks.add(p.block));

      proposers = [...newProposers, ...proposers].slice(0, 5);

      // Dispatch the latest block number and new non-Ballast block count
      if (isLoaded && newProposers.length > 0) {
        dispatch('latestBlock', {
          block: newProposers[0].block,
          timestamp: newProposers[0].timestamp,
          votes: newProposers[0].votes,
          newNonBallastBlocks
        });
      }

      // trim the processed blocks to the last 100
      processedBlocks = new Set(Array.from(processedBlocks).slice(-100));
      isLoaded = true;
    } catch (error) {
      console.error('Error fetching recent proposers:', error);
    }
  }

  onMount(() => {
    fetchRecentProposers();
    intervalId = setInterval(fetchRecentProposers, 10000);
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });
</script>

<div class="bg-white dark:bg-gray-700 rounded-lg shadow-lg p-6 h-56 overflow-hidden">
  <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Recent Blocks</h3>
  <div>
    <ul class="space-y-2">
      {#each proposers as proposer, i (proposer.address + proposer.timestamp)}
        <li 
          in:fade={{ duration: 500, delay: i * 100 }}
          out:fade={{ duration: 500 }}
          class="flex flex-row justify-between text-gray-700 dark:text-gray-300"
        >
          <a class="text-sm md:col-span-1 block hover:underline" href={`/wallet/${proposer.address}`}>
            {proposer.address.slice(0, 8)}...{proposer.address.slice(-8)}
          </a>
          <a class="text-sm text-gray-500 dark:text-gray-400 hover:underline" href={`https://explorer.voi.network/explorer/block/${proposer.block}`} target="_blank">{proposer.block}</a>
        </li>
      {/each}
      {#if proposers.length === 0}
        {#each Array(5) as _, i}
          <li class="flex flex-col md:grid md:grid-cols-3 md:gap-4 text-gray-400 dark:text-gray-600 h-[46px]">
            <span class="font-medium col-span-1">Loading...</span>
          </li>
        {/each}
      {/if}
    </ul>
  </div>
</div>