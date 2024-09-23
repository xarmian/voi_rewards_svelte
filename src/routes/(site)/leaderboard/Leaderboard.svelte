<script lang="ts">
    import type { VRPhase2 } from "$lib/supabase";
	import { onMount } from "svelte";
	export let data: VRPhase2[] = [];
    let pointsData = [];

    onMount(async () => {
        /*const res = await fetch("https://arc72-idx.nautilus.sh/nft-indexer/v1/arc200/balances?contractId=51060671");
        pointsData = (await res.json()).balances || [];

        pointsData.forEach((row: { accountId: string; balance: string; }) => {
            const e = data.find((d) => d.wallet === row.accountId);
            if (e) e.points = Number(BigInt(row.balance) / 1000000n);
        });*/
    });
</script>

<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
	<thead class="table-header text-white bg-[#2c037a] dark:bg-[#672ed9]">
		<tr>
			<th class="px-1 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Rank</th>
			<th class="px-1 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">User Account</th>
            <th class="px-1 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider hidden">$POINTS</th>
			<th class="px-1 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"># Actions</th>
			<th class="px-1 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Quest Points</th>
		</tr>
	</thead>
	<tbody class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        {#each data as row, i}
            <tr class={i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-slate-800'}>
                <td class="px-1 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {row.row_number??(i+1)}
                </td>
                <td class="px-1 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300"
                    title={row.address}>
                    <a href="/phase2/{row.address}" class="hover:underline text-blue-600">
                    {row.address.slice(0, 8)}...{row.address.slice(-8)}
                    </a>
                </td>
                <td class="px-1 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 hidden">
                    {row.points_tokens??0}
                </td>
                <td class="px-1 sm:px-6 py-4 whitespace-nowrap text-sm font-medium dark:text-[#65dbab]">
                    {row.quest_data
                        ? Object.values(row.quest_data).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)
                        : 0}
                </td>
                <td class="px-1 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    {Math.round(row.total_quest_points??0)}
                </td>
            </tr>
        {/each}
	</tbody>
</table>

<style>
</style>
