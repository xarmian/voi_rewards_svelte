<script lang="ts">
    import WalletSearch from "$lib/component/WalletSearch.svelte";
	import { goto } from "$app/navigation";
    import type { PageData } from './$types';
	import QuestComponent from "$lib/component/QuestComponent.svelte";
	import { onMount } from "svelte";
    import VoiLogoStatic from '$lib/assets/Voi_Logo_White_Transparent_Background.png';
    import Time from 'svelte-time';
	import InfoButton from "$lib/component/ui/InfoButton.svelte";
    import type { VrPhase2 } from '$lib/supabase';

    export let data: PageData;
    $: selectedWallet = data.props.wallet as string | undefined;
    let searchText: string | undefined;
    let projectId = data.props.projectId;
    let isEligible = false;
    let loaded = false;
    let mounted = false;
    let showAllocationModal = false;

    const updateEligibility = (wallet: string) => {
        fetch(`/api/eligibility?wallet=${wallet}`).then(r => r.json()).then(d => {
            isEligible = d.isEligible;
            loaded = true;
        });
    }

    onMount(() => {
        if (selectedWallet) {
            searchText = selectedWallet;

            // updateEligibility(selectedWallet);
        }
        else if (searchText) {
            selectedWallet = searchText;
        }
        mounted = true;
    });

    let totalPoints = 0;
    $: if (selectedWallet && mounted) {
        updateEligibility(selectedWallet);
    }

</script>
<div class="flex flex-col bg-[rgb(111,42,226)]">
    <div class="flex flex-col">
        <img src={VoiLogoStatic} alt="Voi Logo" class="-my-32 h-[30rem] z-0 self-center object-cover object-center" style="clip-path: inset(180px 0 180px 0)">
        <div class="flex flex-col justify-center items-center text-white z-10 -my-14 mb-10">
            <h1 class="text-5xl font-bold text-center">Voi Ecosystem Quests</h1>
        </div>
    </div>
    <div class="flex space-x-4 place-self-center mb-8">
        <a href="https://voiager.org/get-started" target="_blank" class="flex items-center justify-center px-4 py-2 bg-blue-500 text-white font-medium rounded-md shadow hover:bg-blue-700 transition duration-150 ease-in-out">
            <i class="fas fa-faucet mr-2"></i> $VOI Faucet
        </a>
        <a href="https://faucet.nautilus.sh{selectedWallet ? '?account='+selectedWallet : ''}" target="_blank" class="flex items-center justify-center px-4 py-2 bg-green-500 text-white font-medium rounded-md shadow hover:bg-green-700 transition duration-150 ease-in-out">
            <i class="fas fa-faucet mr-2"></i> $VIA Faucet
        </a>
    </div>
    <div class="flex flex-col w-full bg-white dark:bg-gray-800 place-items-center">
        <div class="px-2 m-4 w-full sm:w-1/2">
            <WalletSearch onSubmit={(v) => {goto(`/phase2/${v}`)}} {searchText} />
        </div>
        {#if data.props.wallet && data.props.leaderboardData}
            <div class="flex flex-col place-items-center pt-4">
                <!--<div class="items-center sm:items-start sm:ml-4 m-1 mb-8">
                    <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-3xl" on:click={() => showAllocationModal = true}>
                        🎉 View your Phase 2 Estimated Rewards! 🎉
                    </button>
                </div>-->
                <div class="flex flex-wrap place-self-center">
                    <div class="flex flex-col items-center sm:items-start sm:ml-4 m-1">
                        <div class="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 shadow-md h-48 w-48 flex flex-col items-center justify-center">
                            <div class="text-2xl font-semibold text-gray-800 dark:text-white">{data.props.leaderboardData.network??0}</div>
                            <a class="text-blue-500 underline hover:text-blue-400 pointer" href="/wallet/{selectedWallet}">Node Points</a>
                        </div>
                    </div>
                    <div class="flex flex-col items-center sm:items-start sm:ml-4 m-1">
                        <div class="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 shadow-md h-48 w-48 flex flex-col items-center justify-center">
                            <div class="flex space-x-1">
                                <div class="text-2xl font-semibold text-gray-800 dark:text-white">{(data.props.leaderboardData.total??0) - (data.props.leaderboardData.network??0)}</div>
                                <div class="self-center">
                                    <InfoButton noAbsolute={true}>
                                        <div class="text-sm">
                                            Ecosystem Actions count includes the following projects:
                                            <ul class="list-disc list-inside text-xs">
                                                <li>Node Running</li>
                                                <li>Kibisis</li>
                                                <li>Nautilus</li>
                                                <li>Nomadex</li>
                                                <li>Humble</li>
                                                <li>NFTNavigator</li>
                                                <li>Mechaswap</li>
                                                <li>AlgoLeagues</li>
                                                <li>Chubs v2</li>
                                            </ul>
                                        </div>
                                    </InfoButton>
                                </div>
                            </div>
                            <div class="text-gray-500 dark:text-gray-300">Ecosystem Actions</div>
                        </div>
                    </div>
                    <div class="flex flex-col items-center sm:items-start sm:ml-4 m-1">
                        <div class="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 shadow-md h-48 w-48 flex flex-col items-center justify-center">
                            <div class="text-2xl font-semibold text-gray-800 dark:text-white">{data.props.leaderboardData.row_number??0}</div>
                            <!--<div class="text-2xl font-semibold text-gray-800 dark:text-white">Not Available</div>-->
                            <a class="text-blue-500 underline hover:text-blue-400 pointer" href="/leaderboard">Leaderboard Position</a>
                        </div>
                    </div>
                    <div class="flex flex-col items-center sm:items-start sm:ml-4 m-1">
                        <div class="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 shadow-md h-48 w-48 flex flex-col items-center justify-center">
                            {#if loaded}
                                {#if !isEligible}
                                    <div class="relative text-2xl font-semibold text-yellow-800 dark:text-yellow-300 text-center">Address NOT Registered</div>
                                    <div class="text-sm">For Phase 2</div>
                                    <a class="text-blue-500 underline hover:text-blue-400 pointer" href="/accounts">Manage Account</a>
                                    <div class="absolute top-1 right-1">
                                        <InfoButton noAbsolute={true}>
                                            <div class="text-sm">
                                                Register your addresses at the link above to be eligible for the Phase 2 Testnet Rewards.
                                            </div>
                                        </InfoButton>
                                    </div>
                                {:else}
                                    <div class="text-xl font-semibold text-green-800 dark:text-green-300 text-center">🎉 Address Registered 🎉</div>
                                    <div class="text-sm">For Phase 2</div>
                                    <a class="text-blue-500 underline hover:text-blue-400 pointer" href="/accounts">Manage Account</a>
                                {/if}
                            {:else}
                                <div class="text-xl font-semibold text-gray-800 dark:text-white text-center">Checking Phase 2 Registration Status...</div>
                            {/if}
                        </div>
                    </div>
                </div>
                <div class="items-center sm:items-start sm:ml-4 m-1">
                    <div class="text-sm">
                        NOTICE: Data above is delayed. Last Updated
                        <Time timestamp={data.props.leaderboardData.last_modified} format="MMM D, YYYY h:mm A" relative />
                    </div>
                </div>
            </div>
        {/if}
        <QuestComponent walletId={selectedWallet} bind:selectedTab={projectId} leaderboardData={data.props.leaderboardData} projects={data.props.projects} />
    </div>
</div>
{#if showAllocationModal}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20">
        <div class="bg-white dark:bg-black p-8 rounded-lg shadow-lg max-h-[90vh] overflow-y-auto relative">
            <div class="flex flex-col h-full max-h-[80vh]">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold">Your Phase 2 Estimated Rewards</h2>
                    <button class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-700" on:click={() => showAllocationModal = false}>X</button>
                </div>
                <div class="overflow-y-auto flex-grow pr-4">
                    <div class="mb-4">
                        <h3 class="text-xl font-semibold mb-2">Discord Status</h3>
                        <div class="flex flex-col space-y-2 ml-4">
                            <div class="flex items-center">
                                <span class="mr-2">Discord Linked:</span>
                                {#if data.props.questData?.discord_linked}
                                    <span class="text-green-500">✓ Linked</span>
                                {:else}
                                    <span class="text-red-500 flex flex-row">✗ Not Linked
                                        <InfoButton noAbsolute={true}>
                                            <div class="text-sm">
                                                Receive a reward boost by linking your Discord Account by going to <a href="https://voirewards.com/accounts" target="_blank">https://voirewards.com/accounts</a> and clicking the "Link Discord" button.
                                            </div>
                                        </InfoButton>
                                    </span>
                                {/if}
                            </div>
                            <div class="flex items-center">
                                <span class="mr-2">Phase 2 Discord Role:</span>
                                {#if data.props.questData?.discord_roles?.includes('Phase 2')}
                                    <span class="text-green-500">✓ Assigned</span>
                                {:else}
                                    <span class="text-red-500 flex flex-row">✗ Not Assigned
                                        <InfoButton noAbsolute={true}>
                                            <div class="text-sm">
                                                Receive a reward boost by being assigned the Phase 2 Discord Role. To get the role, join the Voi Discord and go to the #phase2 channel for instructions on performing human verification.
                                            </div>
                                        </InfoButton>
                                    </span>
                                {/if}
                            </div>
                        </div>
                    </div>
                    <table class="w-full">
                        <thead>
                            <tr>
                                <th class="text-left">Quest</th>
                                <th></th>
                                <th class="text-center">Completed</th>
                                <th class="text-right">Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.props.projects as project}
                                {#if data.props.questList.filter(quest => quest.project === project.id).length > 0}
                                    <tr>
                                        <td colspan="3" class="text-xl font-bold pt-4 pb-2">{project.title}</td>
                                    </tr>
                                    {#each data.props.questList.filter(quest => quest.project === project.id) as quest}
                                        <tr>
                                            <td class="text-lg font-semibold pl-4">{quest.title}</td>
                                            <td class="text-gray-500">
                                                {quest.reward}
                                            </td>
                                            <td class="text-center">
                                                {#if data.props.questData?.quest_data?.[quest.id] > 0}
                                                    <span class="text-green-500">✓
                                                        {#if data.props.questData?.quest_data?.[quest.id] > 1}
                                                            x{data.props.questData?.quest_data?.[quest.id]}
                                                        {/if}
                                                    </span>
                                                {:else}
                                                    <span class="text-red-500">✗</span>
                                                {/if}
                                            </td>
                                            <td class="text-right">{(data.props.questData?.quest_data?.[quest.id]??0) * (data.props.questList.find(q => q.id === quest.id)?.reward??0) ?? 0}</td>
                                        </tr>
                                    {/each}
                                {/if}
                            {/each}
                            <tr>
                                <td colspan="2" class="text-xl font-bold pt-4 pb-2">$POINTS Tokens</td>
                                <td class="text-right">
                                    {#if data.props.questData?.points_tokens}
                                        {(data.props.questData.points_tokens / Math.pow(10, 6)).toFixed(6)}
                                    {:else}
                                        N/A
                                    {/if}
                                </td>
                                <td class="text-right">
                                    {data.props.questData?.points_tokens ? (data.props.questData.points_tokens / Math.pow(10, 6) * 0.001) : 'N/A'}
                                </td>
                            </tr>
                            <tr class="border-t-2 border-gray-300">
                                <td colspan="3" class="text-xl font-bold pt-2 pb-4">Estimated $VOI Rewards</td>
                                <td class="text-right">
                                    {data.props.totalPoints}
                                </td>
                            </tr>
        
                        </tbody>
                    </table>
                </div>
                <div class="mt-4">
                    <button class="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700" on:click={() => showAllocationModal = false}>Close</button>
                </div>
            </div>
        </div>
    </div>
{/if}