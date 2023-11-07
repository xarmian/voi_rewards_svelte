<script lang="ts">
	import { onMount } from 'svelte';
    import { Card } from 'flowbite-svelte';
	import { algodClient } from '$lib/utils/algod';
    //@ts-ignore
    import Device from 'svelte-device-info';

    const displayBalance = (amt: number) => {
        return (amt / Math.pow(10,6)).toLocaleString();
    }

    export let walletId: string;
    export let isModal = true;
    let accountInfo: any;
    let supply: any;
    $: estimatedBlocks = 0;
    $: balance = 0;
    $: isMobile = false;
    let apiData: any;
    $: apiData = {};
    $: nodeData = (apiData.data) ? apiData.data[0] : {};

    $: {
        balance = Number(accountInfo?.amount??0);
    }

    $: if (supply && apiData.first_block && balance > 0) {
        // calculate expected block proposals in current epoch
        const epochBlocks = apiData.last_block - apiData.first_block;
        estimatedBlocks = Math.round(balance / supply['online-money'] * epochBlocks);
    }
    
    onMount(async () => {
        try {
            // Get account information
            accountInfo = await algodClient.accountInformation(walletId).do();
        } catch (error) {
            console.error('Failed to fetch account balance:', error);
        }

        supply = await algodClient.supply().do();

        // get node information
        const url = `https://socksfirstgames.com/proposers/index_test.php?wallet=${walletId}`;
        await fetch(url, { cache: 'no-store' })
            .then((response) => response.json())
            .then((data) => {
                apiData = data;
            })
            .catch((error) => {
                console.error(error);
            });
        isMobile = Device.isMobile;
    });
</script>

<div class='cardContainer' style='margin:0;margin-top:18px;'>
    <Card padding="md" size="lg">
        <h3>
            Account
            {#if isModal}
                <a href="/wallet/{walletId}" target="_blank" style="float:right;" title="Open Wallet View in new page">
                    <i class="fas fa-external-link-alt"></i>
                </a>
            {/if}
        </h3>
        <h1 class="font-bold">
            <a href='https://voi.observer/explorer/account/{walletId}/transactions'
             title="Open wallet in Voi.Observer"
             target='_blank' class="text-blue-500 hover:text-blue-800 hover:underline">
                {#if isMobile}
                    {walletId.substring(0, 8)}...{walletId.substring(walletId.length - 8, walletId.length)}
                {:else}
                    {walletId}
                {/if}
            </a>
        </h1>
        <br/>
        <div class="cardContents">
            {#if !accountInfo}
                <p>Loading...</p>
            {:else}
                <p>
                    <span class="label" style='width:5.2rem;'>Balance:</span>
                    <span>{displayBalance(balance)} VOI</span>
                </p>
                <p>
                    <span class="label" style='width:5.2rem;'>Consensus:</span>
                    <span class="p-1 rounded-lg border-solid text-white {accountInfo.status=='Online' ? 'bg-green-500' : 'bg-gray-300'}">{accountInfo.status}</span>
                </p>
            {/if}
        </div>
    </Card>
</div>
<div class='flex flex-row flex-wrap justify-center'>
    <div class='cardContainer'>
        <Card padding="md" size="lg">
            <h3>Node</h3>
            {#if Object.keys(apiData).length > 0 && Object.keys(nodeData).length == 0}
                <div class="cardContents">
                    <p>No Telemetry Data Available</p>
                </div>
            {:else}
                <div class="cardContents">
                    <p>
                        <span class="label">Status:</span>
                        <span class="{nodeData.health_score ? (nodeData.health_score >= 5.0 ? 'bg-green-500 dark:bg-green-800 text-white' : 'bg-red-500 dark:bg-red-800 text-white') : ''} p-1 rounded-md">
                            {nodeData.health_score ? (nodeData.health_score >= 5.0 ? 'Healthy' : 'Unhealthy') : 'Loading...'}
                        </span>
                    </p>
                    <p>
                        <span class="label">Telemetry ID:</span>
                        <span>{nodeData.node_host??'Loading...'}</span>
                    </p>
                    <p>
                        <span class="label">Telemetry Name:</span>
                        <span>{nodeData.node_name??'Loading...'}</span>
                    </p>
                    <p>
                        <span class="label">Algod Version:</span>
                        <span>{nodeData.ver??'Loading...'}</span>
                    </p>
                    <p>
                        <span class="label">Health Score:</span>
                        <span>{nodeData.health_score??'Loading...'}</span>
                    </p>
                    <p>
                        <span class="label">Wallets on Node:</span>
                        <span>{nodeData.health_divisor??'Loading...'}</span>
                    </p>
                </div>
            {/if}
        </Card>
    </div>
    <div class='cardContainer'>
        <Card padding="md" size="lg">
            <h3>Current Epoch</h3>
            <div class="cardContents">
                <p>
                    <span class="label">Est. Proposals:</span>
                    <span>{typeof apiData.total_blocks != 'undefined' ? estimatedBlocks : 'Loading...'}</span>
                </p>
                <p>
                    <span class="label">Actual Proposals:</span>
                    <span>{apiData.total_blocks??'Loading...'}</span>
                </p>
                <p>
                    <span class="label">Diff:</span>
                    <span>
                        {#if typeof apiData.total_blocks != 'undefined'}
                            {(estimatedBlocks - apiData.total_blocks)*-1} 
                            ({apiData.estimatedBlocks > 0 ?
                                Math.round((estimatedBlocks - apiData.total_blocks) / estimatedBlocks * 10000)/100*(-1) : '0'}%)
                        {:else}
                            Loading...
                        {/if}
                    </span>
                </p>
            </div>
        </Card>
    </div>
</div>

<style>
    h3 {
        font-weight:bold;
        margin-bottom: 10px;
        font-size:larger;
        text-align: center;
    }
    div.cardContainer {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin: 10px;
    }
    div.cardContents {
        display:flex;
        flex-flow: column wrap;
        align-content: center;
    }
    .label {
        font-weight:bold;
        width:9rem;
        display:inline-block;
        /*text-align:right;*/
        margin-right:8px;
        box-sizing: border-box;
    }
    @media (max-width: 768px) {
        .cardContainer {
            width: 100%;
        }
    }
</style>