<script lang="ts">
    import InfoButton from '../../../lib/component/ui/InfoButton.svelte';

    import WalletSearch from "$lib/component/WalletSearch.svelte";
    import { Card, Popover } from "flowbite-svelte";
    import snapshotTSV from "./snapshot.txt?raw";
    //@ts-ignore
    import RangeSlider from "svelte-range-slider-pips";

    interface Snapshot {
        account: string;
        userType: string;
        voiBalance: number;
        viaBalance: number;
    }

    const total_testnet_tokens = 3_421_845_187.26;
    const snapshot_block = 6522332;
    let selectedWallet: string | null = null;
    let airdrop: number | null = null;
    let totalBalance: number | null = null;
    let lockYears: number = 0;
    let totalStake: number[] = [1000];
    let emissionRate: number[] = [250];

    const compoundRates = [0, 0.1, 0.12, 0.15, 0.18, 0.2];
    $: myStake = airdrop ? (airdrop * Math.pow(1 + compoundRates[lockYears], lockYears)) : 0;
    $: monthlyBlockReward = myStake / totalStake[0] * emissionRate[0] / 12;

    // snapshotTSV is a tab-separated value file with the following columns: account, userType, voiBalance, viaBalance. convert to JSON object
    const snapshot: Snapshot[] = snapshotTSV.split('\n').map((line: string) => {
        const [account, userType, voiBalance, viaBalance] = line.split('\t');
        return { account, 
                 userType, 
                 voiBalance: parseInt(voiBalance) / Math.pow(10,6), 
                 viaBalance: parseInt(viaBalance) / Math.pow(10,6)
        };
    });

    $: if (selectedWallet && snapshot) {
        totalBalance = (snapshot.find((s) => s.account === selectedWallet)?.voiBalance??0) + (snapshot.find((s) => s.account === selectedWallet)?.viaBalance??0);
        airdrop = totalBalance / total_testnet_tokens * 150_000_000;
    }
    else {
        airdrop = ((totalBalance??0) / total_testnet_tokens * 150_000_000);
    }
    

</script>
<div class="flex flex-col bg-white dark:bg-gray-800">
    <div class="flex flex-col mt-4">
        <h1 class="text-4xl font-bold tracking-tight text-gray-900 dark:text-white place-self-center">
            Phase 1 Snapshot
        </h1>
        <p class="place-self-center">The Voi Testnet Phase 1 Snapshot occurred on May 1, 2024 at 00:00:00 UTC at block # {snapshot_block}</p>
        <br/>
        <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4 w-3/4 place-self-center" role="alert">
            <p>This is an unofficial resource and is not affiliated with Voi Network or the Voi Foundation.
                The data and calculator below attempt to be as accurate as possible based on available information,
                however it is not guaranteed to be accurate. Please verify with official sources before making any decisions.
            </p>
            <br/>
            <p>As always please visit the <a href="https://discord.gg/voi-network" target="_blank" class="underline text-yellow-700">Voi Discord</a>
                for more specific help, and find the <a href="https://medium.com/@voifoundation/testnet-phases-announcement-338b929798bb" target="_blank" class="underline text-yellow-700">official Phase 1 announcement here</a>.
            </p>
        </div>
    </div> 
    <br/>
    <div class="dashboard justify-evenly flex flex-row">
        <Card class="bg-gray-100 dark:bg-gray-700 h-42 w-64 m-2 relative">
            <InfoButton>This is the total eligible tokens distributed during TestNet Phase #1</InfoButton>
            <div class="cardInner">
                <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    TestNet Tokens
                </h5>
                <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                    {total_testnet_tokens.toLocaleString()}
                </p>
            </div>
        </Card>
        <Card class="bg-gray-100 dark:bg-gray-700 h-42 w-64 m-2">
            <div class="cardInner">
                <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Snapshot Block
                </h5>
                <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                    {snapshot_block}
                </p>
            </div>
        </Card>
        <Card class="bg-gray-100 dark:bg-gray-700 h-42 w-64 m-2">
            <div class="cardInner">
                <div class="cardInner">
                    <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                        Eligible Wallets
                    </h5>
                    <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                        {snapshot.length}
                    </p>
                </div>
            </div>
        </Card>

        <Card class="bg-gray-100 dark:bg-gray-700 h-42 w-64 m-2 relative">
            <InfoButton>
                This is the total number of MainNet tokens that will be distributed to eligible wallets based on the snapshot for TestNet Phase #1.
            </InfoButton>
           <div class="cardInner">
                <div class="cardInner">
                    <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                        Mainnet Allocation
                        <div class="text-sm">For TextNet Phase 1</div>
                    </h5>
                    <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                        {(150_000_000).toLocaleString()}
                    </p>
                </div>
            </div>
        </Card>

    </div>
    <br/>
    <p class="text-center">Enter a wallet address to see Snapshot balance, expected Mainnet Allocation, and lockup options</p>
    <div class="text-center">
        <WalletSearch onSubmit={(addr) => selectedWallet = addr} loadPreviousValue={false} />
    </div>
    <br/>
    <div class="inline-flex flex-col p-8 rounded-2xl bg-slate-100 dark:bg-slate-700 place-self-center place-items-center">
        <div class="relative w-full">
            {#if selectedWallet}
                <button class="absolute top-0 right-0 border-gray-400 dark:border-gray-300 border hover:bg-gray-300 text-gray-400 dark:text-white w-8 h-8 rounded-full flex items-center justify-center" on:click={() => {selectedWallet = null; totalBalance = null}}>
                    <i class="fas fa-times"></i>
                </button>
                <h1 class="text-2xl font-bold underline tracking-tight text-gray-900 dark:text-white flex flex-col place-items-center">
                    <div>{selectedWallet.substring(0,8)}...{selectedWallet.substring(selectedWallet.length-8,selectedWallet.length)}</div>
                </h1>
                {#if !snapshot.find((s) => s.account == selectedWallet)}
                    <div>
                        <h1 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white flex place-content-center">
                            Wallet Not Found in Eligible Snapshot List. Input amount below to calculate Mainnet Allocation.
                        </h1>
                    </div>
                {/if}
            {/if}
        </div>
            <div class="flex flex-row place-items-center">
                {#if selectedWallet && snapshot.find((s) => s.account == selectedWallet)}
                    <div class="flex flex-col place-items-center">
                        <Card class="bg-green-100 dark:bg-green-700 h-42 w-60 m-2">
                            <div class="cardInner">
                                <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                    Phase 1 VOI
                                </h5>
                                <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                    {snapshot.find((s) => s.account === selectedWallet)?.voiBalance.toLocaleString()}
                                </p>
                            </div>
                        </Card>    
                        +
                        <Card class="bg-green-100 dark:bg-green-700 h-42 w-60 m-2">
                            <div class="cardInner">
                                <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                    Phase 1 VIA
                                </h5>
                                <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                    {snapshot.find((s) => s.account === selectedWallet)?.viaBalance.toLocaleString()}
                                </p>
                            </div>
                        </Card>    
                    </div>
                    =
                    <Card class="bg-green-100 dark:bg-green-700 h-42 w-60 m-2 relative">
                        <div class="cardInner">
                            <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                Phase 1 Total
                            </h5>
                            <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                {(snapshot.find((s) => s.account === selectedWallet)?.voiBalance + snapshot.find((s) => s.account === selectedWallet)?.viaBalance).toLocaleString()} VOI/VIA
                            </p>
                        </div>
                        <InfoButton>This is the total combined VOI and VIA tokens in the wallet when the snapshot was taken. For the purposes of allocating tokens on Mainnet, 1 VOI = 1 VIA.</InfoButton>                    
                    </Card>
                    <i class="fas fa-arrow-right"></i>
                    <Card class="bg-blue-100 dark:bg-blue-700 h-42 w-60 m-2 relative">
                        <InfoButton>The Mainnet Airdrop is calculated as a percentage of the total eligible VOI and VIA distributed in Phase 1, multiplied by the total Phase 1 allocation of 150 Million.</InfoButton>                    
                        <div class="cardInner">
                            <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                Anticipated Mainnet Airdrop
                            </h5>
                            <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                {airdrop?.toLocaleString()}
                            </p>
                        </div>
                    </Card>    
                {:else}
                    <Card class="bg-green-100 dark:bg-green-700 h-42 w-60 m-2 relative">
                        <div class="cardInner">
                            <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                Phase #1 Total
                            </h5>
                            <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                <input type="number" class="w-40" bind:value={totalBalance} />
                            </p>
                        </div>
                        <InfoButton>This is the total combined VOI and VIA tokens in the wallet when the snapshot was taken. For the purposes of allocating tokens on Mainnet, 1 VOI = 1 VIA.</InfoButton>                    
                    </Card>
                    <i class="fas fa-arrow-right"></i>
                    <Card class="bg-blue-100 dark:bg-blue-700 h-42 w-60 m-2 relative">
                        <InfoButton>The Mainnet Airdrop is calculated as a percentage of the total eligible VOI and VIA distributed in Phase 1, multiplied by the total Phase 1 allocation of 150 Million.</InfoButton>                    
                        <div class="cardInner">
                            <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                Anticipated Mainnet Airdrop
                            </h5>
                            <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                {airdrop?.toLocaleString()}
                            </p>
                        </div>
                    </Card>    
                {/if}
            </div>
            <br/>
            <div class="flex flex-col ">
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
                            <div class="text-sm">After lock-up period</div>
                        </h5>
                        <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                            {(myStake / 12).toLocaleString()}
                        </p>
                    </div>
                </Card> 
            </div>
            <br/>
            <div class="flex flex-col">
                <h1 class="text-4xl font-bold tracking-tight text-gray-900 dark:text-white flex place-content-center">
                    Block Rewards
                </h1>
                <ul class="max-w-xl">
                    <li>Locked tokens may earn block (node running) rewards on their full stakable balance</li>
                    <li>Use the slider below to simulate potential block rewards based on total Online Stake
                        and potential block reward emission rate per year
                    </li>
                    <li class="text-yellow-500 dark:text-yellow-300">This is a simulation for entertainment purposes only. It is only an estimation!</li>
                </ul>
                <br/>
                <div class="flex flex-row space-x-2">
                    <Card class="bg-blue-100 dark:bg-blue-700 h-42 w-60 m-2 relative self-center">
                        <div class="cardInner">
                            <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                Block Rewards
                                <br/>
                                <div class="text-sm">per month with above stake</div>    
                            </h5>
                            <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                {monthlyBlockReward.toLocaleString()}
                            </p>
                        </div>
                    </Card>     
                    <div class="flex flex-col self-center space-y-1">
                        <div class="w-96">
                            <div class="flex flex-row items-center justify-between">
                                <div class="flex flex-row items-center">
                                    Total Online Stake
                                    <InfoButton noAbsolute={true}>
                                        This is the total amount of tokens staked on the network. The higher the total stake, the lower the individual rewards.
                                    </InfoButton>
                                </div>
                                <i class="fas fa-arrow-right"></i>
                                <div class="flex flex-row items-center">
                                    <div class="ml-2 p-1 bg-blue-200 dark:bg-blue-700 rounded-md">
                                        {(totalStake[0] * 1000000).toLocaleString()} VOI
                                    </div>
                                </div>
                            </div>
                            <RangeSlider bind:values={totalStake} min={100} max={2000} formatter={(v) => (v < 1000) ? v+'M' : (v/1000)+'B'} step={100} float={false} first="label" last="label" pips={true} />
                        </div>
                        <div class="w-96 self-center">
                            <div class="flex flex-row items-center justify-between">
                                <div class="flex flex-row items-center">
                                    Reward Emission per Year
                                    <InfoButton noAbsolute={true}>
                                        This is the total amount of tokens that will be distributed as block rewards over the course of a year. The higher the emission rate, the higher the rewards.
                                    </InfoButton>
                                </div>
                                <i class="fas fa-arrow-right"></i>
                                <div class="flex flex-row items-center">
                                    <div class="ml-2 p-1 bg-blue-200 dark:bg-blue-700 rounded-md">
                                        {(emissionRate[0] * 1000000).toLocaleString()} VOI
                                    </div>
                                </div>
                            </div>
                            <RangeSlider bind:values={emissionRate} min={50} max={500} formatter={(v) => (v < 1000) ? v+'M' : (v/1000)+'B'} step={50} float={false} first="label" last="label" pips={true} />
                            
                        </div>
                    </div>
                </div>
            </div>
    </div>
</div>
<style>
    li {
        list-style-type: disc;
    }
</style>