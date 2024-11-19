<script lang="ts">
    import NodeComponent from '../lib/component/NodeComponent.svelte';
    import ProposalsComponent from '$lib/component/ProposalsComponent.svelte';
    import LockVestComponent from '$lib/component/LockVestComponent.svelte';
    import RewardCalcComponent from '$lib/component/RewardCalcComponent.svelte';
    import RewardsComponent from '$lib/component/RewardsComponent.svelte';
    import PointsComponent from '$lib/component/PointsComponent.svelte';
    import QuestComponent from '$lib/component/QuestComponent.svelte';
    import { Spinner } from 'flowbite-svelte';

	import { onMount } from 'svelte';
    import { Card } from 'flowbite-svelte';
	import { algodClient } from '$lib/utils/algod';
    import { getNFD } from '$lib/utils/nfd'
    import { copy } from 'svelte-copy';
    import { toast } from '@zerodevx/svelte-toast';
    import { page } from '$app/stores';
    import { Badge } from 'flowbite-svelte';
    import { pan } from 'svelte-gestures';
    import { calculateRewards } from '$lib/utils/rewards';
	import { getSupplyInfo } from '$lib/stores/accounts';
	import { dataTable } from '../stores/dataTable';
	import { extrapolateRewardPerBlock, getTokensByEpoch } from '$lib/utils';
	import CopyComponent from '$lib/component/ui/CopyComponent.svelte';

    const displayBalance = (amt: number) => {
        return (amt / Math.pow(10,6)).toLocaleString();
    }

    const urlParams = $page.url.searchParams;

    export let walletId: string;
    export let isModal = true;
    let accountInfo: any;
    $: balance = 0;
    $: nfDomain = '';

    $: {
        balance = Number(accountInfo?.amount??0);
    }

    onMount(async () => {
        try {
            // Get account information
            accountInfo = await algodClient.accountInformation(walletId).do();
            
            // Get supply and VOI per block data
            const [supplyInfo, dates] = await Promise.all([
                getSupplyInfo(),
                dataTable.fetchDateRanges()
            ]);
            
            const latestEpoch = dates[dates.length - 1];
            const epochData = await dataTable.fetchData(latestEpoch.id);
            let voiPerBlock = 0;
            
            if (epochData) {
                const tokens = await getTokensByEpoch(latestEpoch.epoch);
                const rewardedBlocks = epochData.num_blocks + Math.min(epochData.num_blocks / 3, epochData.num_blocks_ballast);
                const rewardData = extrapolateRewardPerBlock(rewardedBlocks, tokens);
                voiPerBlock = rewardData.projectedRewardPerBlock;
            }

            const balance = Number(accountInfo?.amount??0);
            const onlineMoney = Number(supplyInfo?.['online-money']??0);
            
            const rewards = calculateRewards(balance, onlineMoney, voiPerBlock);
            
            // You can now use rewards.averageBlockTime, rewards.expectedBlocksPerDay, etc.
            
        } catch (error) {
            console.error('Failed to fetch account data:', error);
        }

        const nfdData: any = await getNFD([walletId]);
        nfDomain = nfdData.find((nfd: any) => nfd.key === walletId)?.replacementValue;
    });

    const tabs: any = [
        //{name: 'Rewards', component: RewardCalcComponent},
        {name: 'Node', component: NodeComponent},
        {name: 'Proposals', component: ProposalsComponent},
        //{name: 'Lock+Vest', component: LockVestComponent},
        //{name: 'Rewards', component: RewardsComponent},
        //{name: 'Weekly Health', component: PointsComponent},
        //{name: 'Quests', component: QuestComponent},
    ];

    let currentIndex = 0;
    let containerWidth: number;

    function handlePan(event: CustomEvent<{dx: number}>) {
        const { dx } = event.detail;
        if (Math.abs(dx) > containerWidth / 4) {
            if (dx > 0 && currentIndex > 0) {
                currentIndex--;
            } else if (dx < 0 && currentIndex < tabs.length - 1) {
                currentIndex++;
            }
            selectedTab = tabs[currentIndex].name;
        }
    }

    let isTabChanging = false;

    function handleScroll(event: WheelEvent) {
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !isTabChanging) {
            event.preventDefault();
            isTabChanging = true;

            if (event.deltaX > 0 && currentIndex < tabs.length - 1) {
                currentIndex++;
            } else if (event.deltaX < 0 && currentIndex > 0) {
                currentIndex--;
            }

            selectedTab = tabs[currentIndex].name;

            setTimeout(() => {
                isTabChanging = false;
            }, 1000);
        }
    }

    $: {
        currentIndex = tabs.findIndex((tab: { name: string; }) => tab.name === selectedTab);
    }

    $: selectedTab = (urlParams.has('tab')) ? urlParams.get('tab') : 'Node';
</script>

<div class='max-w-4xl mx-auto'>
    {#if !accountInfo}
        <div class="flex justify-center items-center h-64">
            <Spinner size="16" />
        </div>
    {:else}
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl p-6">
        <h3 class="text-2xl font-bold mb-4 flex items-center justify-between text-gray-800 dark:text-gray-200">
            <span>Account</span>
            <div>
                <CopyComponent
                    text={walletId}
                    toastMessage={`Wallet Copied to Clipboard:<br/> ${walletId.substring(0,20)}...`}
                    failureMessage={`Failed to copy wallet address to clipboard.`}
                />
                {#if isModal}
                    <a href="https://explorer.voi.network/explorer/account/{walletId}/transactions" 
                       class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300" 
                       target="_blank" 
                       aria-label="View account on Voi Explorer"
                       title="View account on Voi Explorer"
                    >
                        <i class="fas fa-globe"></i>
                    </a>
                {/if}
            </div>
        </h3>
        <h1 class="text-xl mb-4 text-center">
            <a href='/wallet/{walletId}'
             title="Open account in new page"
             class="text-blue-500 hover:text-blue-700 hover:underline">
                <span class="font-mono text-lg overflow-hidden whitespace-nowrap text-ellipsis max-w-full">
                    {walletId.substring(0, 10)}...{walletId.substring(walletId.length - 10)}
                </span>
                <i class="fas fa-external-link-alt"></i>
            </a>
        </h1>
        {#if nfDomain}
            <p class="text-center mb-6">
                <a href='https://app.nf.domains/name/{nfDomain}' target='_blank' class="text-blue-500 hover:text-blue-700 hover:underline">
                    {nfDomain}
                </a>
            </p>
        {/if}
        <div class="space-y-3">
            {#if !accountInfo}
                <p class="text-center text-gray-600 dark:text-gray-400">Loading...</p>
            {:else}
                <p class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Balance:</span>
                    <span class="text-gray-800 dark:text-gray-200">{displayBalance(balance)} VOI</span>
                </p>
                <p class="flex justify-between items-center py-2">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Consensus:</span>
                    <Badge color={accountInfo.status === 'Online' ? 'green' : 'gray'}>
                        {accountInfo.status}
                    </Badge>
                </p>
            {/if}
        </div>
    </div>
    {/if}
</div>

<div class="max-w-4xl mx-auto mt-8">
    <div class="flex border-b justify-center mb-6 overflow-x-auto no-scrollbar">
        {#each tabs as tab, index}
            <button class="py-2 px-4 border-b-2 font-medium text-sm focus:outline-none transition-colors duration-200 whitespace-nowrap
                {(selectedTab === tab.name) ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:border-gray-300'}"
                on:click|stopPropagation={() => selectedTab = tab.name}>
                {tab.name}
            </button>
        {/each}
    </div>

    <div class="overflow-hidden" bind:clientWidth={containerWidth}>
        <div 
            use:pan={{ delay: 0, threshold: 5, preventDefault: true }}
            on:panmove={handlePan}
            on:wheel={handleScroll}
            class="flex transition-transform duration-300 ease-in-out"
            style="transform: translateX(-{currentIndex * 100}%);"
        >
            {#each tabs as tab}
                <div class="w-full flex-shrink-0">
                    <svelte:component this={tab.component} walletId={walletId} />
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    /* Hide scrollbar for Chrome, Safari and Opera */
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }

    /* Hide scrollbar for IE, Edge and Firefox */
    .no-scrollbar {
        -ms-overflow-style: none;  /* IE and Edge */
        scrollbar-width: none;  /* Firefox */
    }
</style>
