<script lang="ts">
    import { onMount } from 'svelte';

    export let walletId: string;
    let points: any = [];

    async function loadPoints() {
        try {
            const url = `https://api.voirewards.com/proposers/index_p2.php?action=walletPoints&wallet=${walletId}`;
            const data = await fetch(url).then((response) => response.json());

            // data is an object of objects with key: date, { health, points }
            points = Object.keys(data).map((key) => {
                return { date: key, health: data[key].health, points: data[key].points };
            });
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    onMount(async () => {
        loadPoints();
    });
    
</script>

<div class='flex flex-row flex-wrap justify-center'>
    <!-- table of transactions with columns for block, amount, transaction id -->
    <div class='w-full flex flex-col place-items-center mt-3'>
        <div class='w-full md:w-3/4 -mt-6 mb-6'>For Voi Testnet Phase 2, nodes will be rewarded based on the number of weeks the node is healthy (score >5.0) during the Phase 2 time period.</div>
        <table class='w-full border-collapse'>
            <thead>
                <tr class='bg-gray-200 dark:bg-gray-700 rounded-lg'>
                    <th class='text-left'>Week</th>
                    <th class='text-left'>Health Score</th>
                    <th class='text-left'>Points</th>
                </tr>
            </thead>
            <tbody>
                {#each points as rec}
                    <tr class='dark:border-gray-500'>
                        <td class='dark:border-gray-500'>{rec.date}</td>
                        <td class='dark:border-gray-500'>{rec.health}</td>
                        <td class='dark:border-gray-500'>{rec.points}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</div>

<style>
    th, td {
        padding: 5px;
    }
</style>