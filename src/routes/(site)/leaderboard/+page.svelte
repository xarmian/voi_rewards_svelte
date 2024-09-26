<script lang="ts">
	import Leaderboard from "./Leaderboard.svelte";
    import { supabasePublicClient } from "$lib/supabase";
    import type { VRPhase2 } from "$lib/supabase"
    import type { PageData } from './$types';
	import InfoButton from "$lib/component/ui/InfoButton.svelte";
	import Time from "svelte-time/Time.svelte";
    
    export let data: PageData;
    let searchTerm = '';
    let ranks: VRPhase2[] | undefined = data.ranks;
    let filterRanks: VRPhase2[] | undefined = ranks;

    $: {
        if (searchTerm.length > 0) {
            supabasePublicClient
                .from('vr_phase2')
                .select('*')
                .ilike('address', `%${searchTerm}%`)
                .order('total_quest_points', { ascending: false }).limit(50)
                .then(({ data, error }) => {
                    if (error) {
                        console.error(error);
                    } else {
                        filterRanks = data;
                    }
                });
        } else {
            filterRanks = ranks?.slice(0, 100);
        }
    }

</script>
<div class="bg-[rgb(111,42,226)] dark:bg-[#2C037A]">
    <div class="container mx-auto pt-6 text-lg">
        <a href="/" class="text-blue-200">← Back to Home</a>
    </div>

    <div class="container mx-auto my-6">
        <div class="p-2 sm:p-8 rounded-2xl bg-white dark:bg-gray-900 shadow-md">
            <div class="flex flex-col sm:flex-row sm:justify-between">
                <div class="w-full">
                    <div class="text-red-800 dark:text-red-500 font-bold text-2xl text-center mb-4">
                        Testnet Phase 2 has ended. Voi is now in Mainnet. This leaderboard may update as Phase 2 data is processed.
                    </div>
                    <div class="flex flex-row justify-between">
                        <h1 class="text-2xl font-semibold text-gray-800 dark:text-white">
                            <img src="/logos/voi_logo.png" alt="Voi" class="h-14 pb-2 inline-block" />
                            Testnet Phase 2 Quest Leaderboard
                        </h1>
                        <div class="text-gray-500 dark:text-gray-300">
                            {data.total_accounts} Users
                        </div>
                    </div>
                    <div class="text-gray-500 dark:text-gray-300">
                        Points were awarded for participating in Voi Network projects.
                    </div>
                    <div class="mt-4 mb-1 flex justify-between w-full">
                        <input
                            type="text" size="40"
                            placeholder="Search by account address..."
                            class="p-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            bind:value={searchTerm}
                        />
                        {#if ranks}
                            <div class="place-self-end">
                                Last updated: <Time timestamp={ranks[0].last_modified} format="MMM D, YYYY h:mm A" />
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
            <Leaderboard data={filterRanks} />
        </div>
    </div>
</div>