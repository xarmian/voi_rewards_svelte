<script lang="ts">
  import InfoButton from '$lib/component/ui/InfoButton.svelte';
  
  export let title: string;
  export let value: string | null;
  export let subvalue: string = '';
  export let subvalue2: string = '';
  export let info: string = '';

  let dots = '';
  let interval: ReturnType<typeof setInterval>;

  function animateDots() {
    interval = setInterval(() => {
      dots = dots.length < 3 ? dots + '.' : '';
    }, 500);
  }

  $: if (value === null) {
    animateDots();
  } else {
    clearInterval(interval);
    dots = '';
  }
</script>

<div class="bg-white dark:bg-gray-700 rounded-lg shadow-lg p-6 transition duration-300 hover:shadow-xl h-56 relative">
  <div class="flex justify-between items-start mb-2">
    <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-200">
      {title}
    </h3>
    {#if info}
      <InfoButton noAbsolute buttonColor="dark:text-gray-300 text-gray-500">
        {info}
      </InfoButton>
    {/if}
  </div>
  
  <div class="mt-8 flex flex-col items-center justify-center">
    {#if value !== null}
      <p class="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
      {#if subvalue}
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{subvalue}</p>
      {/if}
      {#if subvalue2}
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{subvalue2}</p>
      {/if}
    {:else}
      <p class="text-lg text-gray-500 dark:text-gray-400">Loading{dots}</p>
    {/if}
  </div>
</div>
