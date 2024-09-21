<script lang="ts">
  export let title: string;
  export let value: string | null;
  export let subvalue: string = '';

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

<div class="bg-white dark:bg-gray-700 rounded-lg shadow-lg p-6 transition duration-300 hover:shadow-xl">
  <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">{title}</h3>
  {#if value !== null}
    <p class="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
    {#if subvalue.length > 0}
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{subvalue}</p>
    {/if}
  {:else}
    <p class="text-lg text-gray-500 dark:text-gray-400 mt-1">Loading{dots}</p>
  {/if}
</div>