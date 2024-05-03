<script lang="ts">
    import WalletSearch from "$lib/component/WalletSearch.svelte";
    import { Card } from "flowbite-svelte";
    import { goto } from '$app/navigation';
    import snapshotTSV from "./snapshot.txt?raw";
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
    

</script>
<div>
    <div class="flex flex-col">
        <h1 class="text-4xl font-bold tracking-tight text-gray-900 dark:text-white place-self-center">
            Phase 1 Snapshot
        </h1>
        <p class="place-self-center">The Voi Testnet Phase 1 Snapshot occurred on May 1, 2024 at 00:00:00 UTC at block # {snapshot_block}</p>
        <br/>
        <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4 w-3/4 place-self-center" role="alert">
            <p>This is an unofficial resource and is not affiliated with Voi Network or the Voi Foundation.
                This data and calculator below attempt to be as accurate as possible based on available information,
                however it is not guaranteed to be accurate. Please verify with official sources before making any decisions.
            </p>
            <br/>
            <p>As always please visit the <a href="https://discord.gg/vnFbrJrHeW" target="_blank" class="underline text-yellow-700">Voi Discord</a>
                for more specific help.
            </p>
        </div>
    </div> 
    <br/>
    <div class="dashboard justify-evenly flex flex-row">
        <Card class="bg-gray-100 dark:bg-gray-700 h-42 w-64 m-2">
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

        <Card class="bg-gray-100 dark:bg-gray-700 h-42 w-64 m-2">
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
        <WalletSearch onSubmit={(addr) => selectedWallet = addr} />
    </div>
    <br/>
    {#if selectedWallet}
    <div class="flex flex-col p-8 rounded-2xl bg-slate-100 dark:bg-slate-700 place-items-center">
        <div>
            <h1 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex place-content-center">
                Wallet Selected: {selectedWallet}
            </h1>
        </div>
        {#if selectedWallet && snapshot.find((s) => s.account == selectedWallet)}
            <div class="flex flex-row">
                <Card class="bg-green-100 dark:bg-green-700 h-42 w-60 m-2">
                    <div class="cardInner">
                        <div class="cardInner">
                            <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                Phase 1 Voi
                            </h5>
                            <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                {snapshot.find((s) => s.account === selectedWallet)?.voiBalance.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </Card>    
                <Card class="bg-green-100 dark:bg-green-700 h-42 w-60 m-2">
                    <div class="cardInner">
                        <div class="cardInner">
                            <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                Phase 1 Via
                            </h5>
                            <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                {snapshot.find((s) => s.account === selectedWallet)?.viaBalance.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </Card>    
                
                <Card class="bg-green-100 dark:bg-green-700 h-42 w-60 m-2">
                    <div class="cardInner">
                        <div class="cardInner">
                            <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                Phase 1 Total
                            </h5>
                            <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                {(snapshot.find((s) => s.account === selectedWallet)?.voiBalance + snapshot.find((s) => s.account === selectedWallet)?.viaBalance).toLocaleString()}
                            </p>
                        </div>
                    </div>
                </Card>    
                <Card class="bg-blue-100 dark:bg-blue-700 h-42 w-60 m-2">
                    <div class="cardInner">
                        <div class="cardInner">
                            <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                Anticipated Mainnet Airdrop
                            </h5>
                            <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                                {airdrop?.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </Card>    

            </div>
            <br/>
            <div class="flex flex-col ">
                <h1 class="text-4xl font-bold tracking-tight text-gray-900 dark:text-white flex place-content-center">
                    Lockup Option
                </h1>
                <ul>
                    <li>Airdrop may be locked for up to five years for a 20% componded bonus per year</li>
                    <li>Bonus is earned immediately and may be used for node block rewards</li>
                </ul>
                <br/>
                <p>Select a lockup period to calculate your stakable balance:</p>
            </div>
            <div class="w-80">
                <RangeSlider values={[0]} min={0} max={5} pips={true} all="label" on:change={(e) => lockYears = e.detail.value} />
            </div>
            <Card class="bg-blue-100 dark:bg-blue-700 h-42 w-60 m-2">
                <div class="cardInner">
                    <div class="cardInner">
                        <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                            Stakable Balance
                            <br/>
                            <div class="text-sm">Balance after {lockYears} year lockup</div>
                        </h5>
                        <p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
                            {airdrop ? (airdrop * Math.pow(1.2, lockYears)).toLocaleString() : null}
                        </p>
                    </div>
                </div>
            </Card>    
        {:else}
            <div class="flex flex-col p-8 rounded-2xl bg-slate-100 dark:bg-slate-700 place-items-center">
                <h1 class="text-4xl font-bold tracking-tight text-gray-900 dark:text-white flex place-content-center">
                    Wallet Not Found in Eligible Snapshot List
                </h1>
            </div>
        {/if}
    </div>
    {/if}          
</div>
<style>
    li {
        list-style-type: disc;
    }
</style>