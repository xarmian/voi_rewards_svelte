<script lang="ts">
    import type { PLeaderboard } from "$lib/supabase";
	export let data: PLeaderboard[] = [];
</script>

<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
	<thead class="table-header text-white bg-[#2c037a] dark:bg-[#672ed9]">
		<tr>
			<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Rank</th>
			<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">User Account</th>
			<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Projects</th>
			<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
				>Project Points</th
			>
		</tr>
	</thead>
	<tbody class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
		{#each data as row, i}
			<tr class={i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-slate-800'}>
				<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white"
					>{i+1}</td
				>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300"
                    title={row.wallet}
                    >{row.wallet.slice(0, 8)}...{row.wallet.slice(-8)}</td
                >
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300"
                    >{Object.values(row).filter(item => item !== null).length-3}</td
                >
				<td class="px-6 py-4 whitespace-nowrap text-sm font-medium dark:text-[#65dbab]">{row.total}</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
</style>
