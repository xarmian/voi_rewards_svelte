<script lang="ts">
  interface Account {
    address: string;
    isParticipating: boolean;
    balance: number;
  }

  export let primaryAccount: Account | null;
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
  <div class="flex flex-row space-x-2">
    <div class="text-center md:text-left flex space-x-2">
      <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Account Balance</h3>
      <p class="text-xl font-semibold text-gray-900 dark:text-white">
        {(primaryAccount?.balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} VOI
      </p>
    </div>
    
    <div class="text-center md:text-left flex space-x-2">
      <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Participating?</h3>
      <p class="text-xl font-semibold text-gray-900 dark:text-white">
        {primaryAccount?.isParticipating ? 'Yes' : 'No'}
      </p>
    </div>
  </div>
</div>