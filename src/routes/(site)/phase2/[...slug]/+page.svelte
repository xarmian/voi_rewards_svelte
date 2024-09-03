<script lang="ts">
    import WalletSearch from "$lib/component/WalletSearch.svelte";
	import { goto } from "$app/navigation";
    import type { PageData } from './$types';
	import QuestComponent from "$lib/component/QuestComponent.svelte";
	import { onMount } from "svelte";
    import VoiLogoStatic from '$lib/assets/Voi_Logo_White_Transparent_Background.png';
    import Time from 'svelte-time';
	import InfoButton from "$lib/component/ui/InfoButton.svelte";

    export let data: PageData;
    $: selectedWallet = data.props.wallet as string | undefined;
    let searchText: string | undefined;
    let projectId = data.props.projectId;
    let isEligible = false;
    let loaded = false;
    let mounted = false;

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