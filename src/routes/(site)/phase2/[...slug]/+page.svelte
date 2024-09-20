<script lang="ts">
    import WalletSearch from "$lib/component/WalletSearch.svelte";
	import { goto } from "$app/navigation";
    import type { PageData } from './$types';
	import QuestComponent from "$lib/component/QuestComponent.svelte";
	import { onMount } from "svelte";
    import VoiLogoStatic from '$lib/assets/Voi_Logo_White_Transparent_Background.png';
    import Time from 'svelte-time';
	import InfoButton from "$lib/component/ui/InfoButton.svelte";
    import { page } from '$app/stores'; 
    //@ts-ignore
    import RangeSlider from "svelte-range-slider-pips";
    import { Card } from "flowbite-svelte";

    let dataUpdating = false;

    export let data: PageData;
    $: selectedWallet = data.props.wallet as string | undefined;
    let searchText: string | undefined;
    let projectId = data.props.projectId;
    let isEligible = false;
    let loaded = false;
    let mounted = false;
    let showAllocationModal = false;
    let lockYears: number = 0;
    const compoundRates = [0, 0.1, 0.12, 0.15, 0.18, 0.2];
    $: airdrop = data.props.estimatedReward;
    $: myStake = airdrop ? (airdrop * Math.pow(1 + compoundRates[lockYears], lockYears)) : 0;


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

        if ($page.url.searchParams.get('rewards') && $page.url.searchParams.get('rewards') == '1') {
            showAllocationModal = true;
        }
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
    <div class="hidden flex space-x-4 place-self-center mb-8">
        <a href="https://voiager.org/get-started" target="_blank" class="flex items-center justify-center px-4 py-2 bg-blue-500 text-white font-medium rounded-md shadow hover:bg-blue-700 transition duration-150 ease-in-out">
            <i class="fas fa-faucet mr-2"></i> $VOI Faucet
        </a>
        <a href="https://faucet.nautilus.sh{selectedWallet ? '?account='+selectedWallet : ''}" target="_blank" class="flex items-center justify-center px-4 py-2 bg-green-500 text-white font-medium rounded-md shadow hover:bg-green-700 transition duration-150 ease-in-out">
            <i class="fas fa-faucet mr-2"></i> $VIA Faucet
        </a>
    </div>
    <div class="flex flex-col w-full bg-white dark:bg-gray-800 place-items-center">
        <div class="px-2 m-4 w-full sm:w-1/2">
            <div class="text-center mb-4">
                Phase 2 has completed and Mainnet is live! Search for your address below to view your estimated Phase 2 rewards.
            </div>
            <WalletSearch onSubmit={(v) => {goto(`/phase2/${v}`)}} {searchText} />
        </div>
        {#if data.props.wallet || data.props.leaderboardData}
            <div class="flex flex-col place-items-center pt-4">
                {#if data.props.wallet}
                <div class="items-center sm:items-start sm:ml-4 m-1 mb-8">
                    {#if !dataUpdating}
                        <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-3xl" on:click={() => showAllocationModal = true}>
                            🎉 View your Phase 2 Estimated Rewards! 🎉
                        </button>
                    {:else}
                        <div class="hidden flex-col place-items-center text-xl bg-yellow-100 dark:bg-yellow-900 p-6 rounded-lg shadow-md">
                                <i class="fas fa-sync-alt animate-spin text-3xl mb-4 text-yellow-600 dark:text-yellow-400"></i>
                            <p class="text-center text-yellow-800 dark:text-yellow-200 font-semibold">
                                Rewards data is currently updating!
                            </p>
                            <p class="text-center text-yellow-700 dark:text-yellow-300 mt-2">
                                Please check back again later.
                            </p>
                        </div>
                    {/if}
                </div>
                {/if}
                {#if data.props.leaderboardData}
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
                        <span class="text-red-500">NOTICE:</span> Data above is delayed. Last Updated
                        <Time timestamp={data.props.leaderboardData.last_modified} format="MMM D, YYYY h:mm A" relative />
                    </div>
                </div>
                {/if}
            </div>
        {/if}
        <!--<QuestComponent walletId={selectedWallet} bind:selectedTab={projectId} leaderboardData={data.props.leaderboardData} projects={data.props.projects} />-->
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
                {#if !data.props.questData}
                    <div class="flex flex-col place-items-center">
                        <div class="text-xl font-bold max-w-96">
                            Token Allocation not found for this Address. If this address is linked to a Discord account, your combined token allocation will be listed under your Primary address.
                            <br/>
                            NOTE: Some users are unable to see their estimated rewards. Please check back again later.
                        </div>
                    </div>
                {:else}
                <div class="overflow-y-auto flex-grow pr-4">
                    <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4" role="alert">
                        <h3 class="text-lg font-semibold mb-2">Phase 2 Token Allocations</h3>
                        <p class="mb-2">The token numbers displayed on the Testnet Phase 2 airdrop site are estimates due to:</p>
                        <ul class="list-disc list-inside mb-2">
                            <li>Sybil account filtering</li>
                            <li>New eligibility registrations</li>
                            <li>Stale data missing a few days of quest activity</li>
                            <li>Data analysis for proof of humanity levels, where each earns a different bonus</li>
                        </ul>
                        <p>The score multiplier per proof of humanity level isn't final until October 28th when contracts are funded.</p>
                    </div>
                    <div class="mb-4 relative">
                        <div class="flex items-center absolute top-0 right-0 text-sm">
                            <span class="mr-2">Last Data Refresh:</span>
                            <Time timestamp={data.props.questData?.last_modified} format="MMM D, YYYY h:mm A" />
                            <InfoButton noAbsolute={true}>
                                <div class="text-sm">Data is refreshed periodically. If your Discord account was connected or Human Verification was completed recently, the status and estimated rewards may not be updated until the next refresh.</div>
                            </InfoButton>
                        </div>
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
                                <span class="mr-2">Phase 2 Discord Role (Human Verification):</span>
                                {#if data.props.questData?.discord_roles?.includes('Phase 2') || data.props.questData?.discord_roles?.includes('Phase2-Manual')}
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
                            <div class="text-center text-red-800 dark:text-red-400">
                                <span class="">NOTICE:</span> Discord Status and Roles are delayed. Last Updated:
                                <Time timestamp={data.props.questData?.last_modified} format="MMM D, YYYY h:mm A" relative />
                            </div>
                        </div>
                    </div>
                    <table class="w-full">
                        <thead class="hidden">
                            <tr>
                                <th class="text-left">Quest</th>
                                <th></th>
                                <th class="text-center">Completed</th>
                                <th class="text-right">Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#if false}
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
                                <td colspan="3" class="text-xl font-bold pt-4 pb-2">$POINTS Token Balance</td>
                                <td class="text-right">
                                    {#if data.props.questData?.points_tokens}
                                        {(data.props.questData.points_tokens / Math.pow(10, 6)).toFixed(6)}
                                    {:else}
                                        N/A
                                    {/if}
                                </td>
                            </tr>
                            <tr class="border-t-2 border-gray-300">
                                <td colspan="3" class="text-base font-bold pt-4">Base Quest Points</td>
                                <td class="text-right pt-4 pb-0">
                                    {data.props.totalPoints}
                                </td>
                            </tr>
                            <tr>
                                <td colspan="3" class="text-base font-bold pt-0">Discord Multiplier</td>
                                <td class="text-right pt-0 pb-0">
                                    {Math.round(data.props.discordMultiplier * 100)/100}x
                                </td>
                            </tr>
                            <tr>
                                <td colspan="3" class="text-base font-bold pt-0 pb-4">Proof of Humanity Multiplier</td>
                                <td class="text-right pt-0 pb-4">
                                    {Math.round(data.props.humanMultiplier * 100)/100}x
                                </td>
                            </tr>
                            <tr>
                                <td colspan="3" class="text-lg font-bold pt-0 pb-4">Total Quest Points</td>
                                <td class="text-right pt-0 pb-4">
                                    {(data.props.totalPoints * data.props.discordMultiplier * data.props.humanMultiplier).toFixed(6)}
                                </td>
                            </tr>
                            {/if}
                            <tr>
                                <td colspan="3" class="text-xl font-bold pt-2 pb-4">Estimated $VOI Phase 2 Reward</td>
                                <td class="text-right pb-4 text-2xl">
                                    {data.props.estimatedReward.toFixed(6)} VOI
                                </td>
                            </tr>
        
                        </tbody>
                    </table>
                    <div class="flex flex-col place-items-center mt-4">
                        <div class="flex flex-col place-items-center">
                            <h1 class="text-4xl font-bold tracking-tight text-gray-900 dark:text-white flex place-content-center">
                                Lockup Option
                            </h1>
                            <ul class="max-w-xl">
                                <li>Airdrop may be locked for one to five years for a 10%-20% componded bonus per year</li>
                                <li>Bonus is earned immediately and may be used for node block rewards</li>
                            </ul>
                            <br/>
                            <p>Select a lockup period to calculate your stakable balance:</p>
                        </div>
                        <div class="w-80">
                            <RangeSlider values={[0]} min={0} max={5} pips={true} all="label" on:change={(e) => lockYears = e.detail.value} />
                        </div>
                        <div class="flex flex-row">
                            <Card class="bg-blue-100 dark:bg-blue-700 h-42 w-60 m-2 relative">
                                <InfoButton>
                                    When tokens are locked, the full future bonus amount is allocated and made 
                                    available for staking on a participation node, to earn node rewards.
                                    This number reflects the total amount with the bonus applied, which may be used
                                    to earn node participation rewards.
                                </InfoButton>
                                <div class="cardInner">
                                    <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                        Stakable Balance
                                        <br/>
                                        <div class="text-sm">Balance with {lockYears} year lockup</div>
                                    </h5>
                                    <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                        {myStake.toLocaleString()}
                                    </p>
                                </div>
                            </Card> 
                            <Card class="bg-blue-100 dark:bg-blue-700 h-42 w-60 m-2 relative">
                                <InfoButton>
                                    After the selected lock-up period, tokens will vest at a rate of 1/12 per month for one year.
                                    This number reflects the amount a user may withdraw each month after the lock-up period.
                                </InfoButton>
                                <div class="cardInner">
                                    <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                        Monthly Withdrawable
                                        <br/>
                                        <div class="text-sm">Vesting after lock-up period</div>
                                    </h5>
                                    <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                        {(myStake / 12).toLocaleString()}
                                    </p>
                                </div>
                            </Card> 
                        </div>
                    </div>
                </div>
                {/if}
                <div class="mt-4">
                    <button class="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700" on:click={() => showAllocationModal = false}>Close</button>
                </div>
            </div>
        </div>
    </div>
{/if}