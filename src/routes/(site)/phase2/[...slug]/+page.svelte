<script lang="ts">
    import WalletSearch from "$lib/component/WalletSearch.svelte";
	import { goto } from "$app/navigation";
    import type { PageData } from './$types';
	import QuestComponent from "$lib/component/QuestComponent.svelte";
	import { onMount } from "svelte";
    import VoiLogoStatic from '$lib/assets/Voi_Logo_White_Transparent_Background.png';

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
<div class="flex flex-col dark:bg-[#2C037A]" style="background-color: rgb(111,42,226)">
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
    <div class="w-full bg-white">
        <QuestComponent walletId={selectedWallet} bind:selectedTab={projectId} />
    </div>
</div>