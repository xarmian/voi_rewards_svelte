<script lang="ts">
  export let title: string;
  export let value: string;
  export let subvalue: string = '';
</script>

<div class="bg-white dark:bg-gray-700 rounded-lg shadow-lg p-6 transition duration-300 hover:shadow-xl">
  <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">{title}</h3>
  <p class="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
  {#if subvalue}
    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{subvalue}</p>
  {/if}
</div>