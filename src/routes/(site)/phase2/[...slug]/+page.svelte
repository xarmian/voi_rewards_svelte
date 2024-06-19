<script lang="ts">
    import WalletSearch from "$lib/component/WalletSearch.svelte";
	import { goto } from "$app/navigation";
    import type { PageData } from './$types';
	import QuestComponent from "$lib/component/QuestComponent.svelte";
	import { onMount } from "svelte";

    export let data: PageData;
    $: selectedWallet = data.props.wallet as string | undefined;
    let searchText: string | undefined;
    let projectId = data.props.projectId;

    onMount(() => {
        if (selectedWallet) {
            searchText = selectedWallet;
        }
        else if (searchText) {
            selectedWallet = searchText;
        }
    });
</script>
<div class="flex flex-col dark:bg-[#2C037A]">
    <div class="bg-white dark:bg-gray-800">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex flex-col py-6">
                <div class="flex justify-between items-center">
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
                        Voi Ecosystem Quests
                    </h1>
                    <div class="flex space-x-4">
                        <a href="https://voiager.org/get-started" target="_blank" class="flex items-center justify-center px-4 py-2 bg-blue-500 text-white font-medium rounded-md shadow hover:bg-blue-700 transition duration-150 ease-in-out">
                            <i class="fas fa-faucet mr-2"></i> $VOI Faucet
                        </a>
                        <a href="https://faucet.nautilus.sh{selectedWallet ? '?account='+selectedWallet : ''}" target="_blank" class="flex items-center justify-center px-4 py-2 bg-green-500 text-white font-medium rounded-md shadow hover:bg-green-700 transition duration-150 ease-in-out">
                            <i class="fas fa-faucet mr-2"></i> $VIA Faucet
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>        
    <QuestComponent walletId={selectedWallet} bind:selectedTab={projectId} />
</div>