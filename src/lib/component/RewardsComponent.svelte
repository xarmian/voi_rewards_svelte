<script lang="ts">
    import { onMount } from 'svelte';
    import { algodClient, algodIndexer } from '$lib/utils/algod';
    //@ts-ignore
    import Device from 'svelte-device-info';
	import { Card } from 'flowbite-svelte';

    export let walletId: string;
    const rewardsAddress = 'MRJG32XT7I4WWX54TQTJFXSOXMHNM764BLA5KDPWJXRQRU53R57QGFFX4I';
    //let accountInfo: any;
    let transactions: any = [];
    $: isMobile = false;
    $: nextToken = '';

    const filterTransactions: any = (address: string, transactions: any) => {
        return transactions.filter((tx: any) => {
            return tx.sender === address;
        });
    }

    const loadTransactions = async () => {
        try {
            const transfers = await algodIndexer
                .searchForTransactions()
                .address(walletId)
                .addressRole('receiver')
                .limit(50)
                .do();
            
            if (transfers['next-token']) {
                nextToken = transfers['next-token'];
            } else {
                nextToken = '';
            }

            transactions = transactions.concat(filterTransactions(rewardsAddress, transfers.transactions));
        } catch (error) {
            console.error('Failed to fetch account balance:', error);
        }
    }

    $: { 
        /*if (accountInfo) {
            //console.log(accountInfo);
        }*/

        if (transactions) {
            console.log(transactions);
        }
    }

    onMount(async () => {
        isMobile = Device.isMobile;
        loadTransactions();
    });
    
</script>

<div class='flex flex-row flex-wrap justify-center'>
    <!-- table of transactions with columns for block, amount, transaction id -->
    <div class='w-full'>
        {#if !isMobile}
            <table class='w-full border-collapse'>
                <thead>
                    <tr class='bg-gray-200 dark:bg-gray-700 rounded-lg'>
                        <th class='text-left'>Block</th>
                        <th class='text-left'>Date/Time</th>
                        <th class='text-left'>Amount</th>
                        <th class='text-left'>Transaction ID</th>
                    </tr>
                </thead>
                <tbody>
                    {#each transactions as tx}
                        <tr class='dark:border-gray-500'>
                            <td class='dark:border-gray-500'><a href={'https://explorer.voi.network/explorer/block/'+tx['confirmed-round']+'/transactions'} target='_blank'>{tx['confirmed-round']}</a></td>
                            <td class='dark:border-gray-500'>{new Date(tx['round-time']*1000).toLocaleString()}</td>
                            <td class='dark:border-gray-500'>{(tx['payment-transaction']['amount']/1000000).toLocaleString()} VOI</td>
                            <td class='dark:border-gray-500'><a href={'https://explorer.voi.network/explorer/transaction/'+tx['id']} target='_blank'>{tx['id']}</a></td>
                        </tr>
                    {/each}
                    {#if false && nextToken.length > 0}
                        <tr class='dark:border-gray-500'>
                            <td class='dark:border-gray-500' colspan='4'>
                                <button class='btn btn-primary' on:click={() => loadTransactions()}>Load More</button>
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        {:else}
            {#each transactions as tx}
                <Card class='bg-gray-100 dark:bg-gray-700 mb-3'>
                    <h1>Block: <a href={'https://explorer.voi.network/explorer/block/'+tx['confirmed-round']+'/transactions'} target='_blank'>{tx['confirmed-round']}</a></h1>
                    <div class="p-2">
                        <div>Date: {new Date(tx['round-time']*1000).toLocaleString()}</div>
                        <div>Amount: {(tx['payment-transaction']['amount']/1000000).toLocaleString()} VOI</div>
                        <div>Tx: <a href={'https://explorer.voi.network/explorer/transaction/'+tx['id']} target='_blank'>{tx['id'].slice(0,6)+'...'+tx['id'].slice(-6)}</a></div>
                    </div>
                </Card>
            {/each}
        {/if}
    </div>
</div>

<style>
    th, td {
        padding: 5px;
    }

    a {
        color: #0078D4;
    }

    a:hover {
        color: #004578;
    }
</style>