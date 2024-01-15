<script lang="ts">
	import { onMount } from 'svelte';
    import { Card } from 'flowbite-svelte';
	import { algodClient } from '$lib/utils/algod';

    export let walletId: string;
    let accountInfo: any;
    let supply: any;
    $: estimatedBlocks = 0;
    $: balance = 0;
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
        const url = `https://api.voirewards.com/proposers/index_v3.php?action=walletDetails&wallet=${walletId}`;
        await fetch(url, { cache: 'no-store' })
            .then((response) => response.json())
            .then((data) => {
                apiData = data;
            })
            .catch((error) => {
                console.error(error);
            });
    });

    function formatTime(seconds: number) {
        const days = seconds / (24 * 60 * 60);
        if (days > 3) {
            return `${days.toFixed(1)} days`;
        } else {
            const hours = Math.floor(seconds / (60 * 60));
            seconds %= 60 * 60;
            const minutes = Math.floor(seconds / 60);
            return `${hours} hours, ${minutes} minutes`;
        }
    }

    function dateFromSeconds(seconds: number) {
        const date = new Date();
        date.setSeconds(date.getSeconds() + seconds);
        return date.toLocaleString();
    }
</script>

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
                            ({estimatedBlocks > 0 ?
                                (estimatedBlocks < apiData.total_blocks ? '+' : '-') +
                                Math.abs(Math.round((estimatedBlocks - apiData.total_blocks) / estimatedBlocks * 10000)/100) : '0'}%)
                        {:else}
                            Loading...
                        {/if}
                    </span>
                </p>
            </div>
        </Card>
    </div>
    {#if accountInfo && accountInfo.status=='Online'}
        <div class='cardContainer'>
            <Card padding="md" size="lg">
                <h3>Consensus</h3>
                <div class="cardContents">
                    <p>
                        <span class="label">Vote Key Expires:</span>
                        <span>{accountInfo ? (formatTime((accountInfo['participation']['vote-last-valid'] - accountInfo['round'])*3.3)) : 'Loading...'}</span>
                    </p>
                    <p>
                        <span class="label"></span>
                        <span>{accountInfo ? (dateFromSeconds((accountInfo['participation']['vote-last-valid'] - accountInfo['round'])*3.3)) : 'Loading...'}</span>
                    </p>
                    <p>
                        <span class="label"></span>
                        <span>{accountInfo ? `Block ${accountInfo['participation']['vote-last-valid'].toLocaleString()}` : 'Loading...'}</span>
                    </p>
                </div>
            </Card>
        </div>
    {/if}
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

