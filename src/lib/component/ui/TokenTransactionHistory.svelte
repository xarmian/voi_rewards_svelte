<script lang="ts">
    //@ts-ignore
    import Device from 'svelte-device-info';
    import { onMount } from 'svelte';
    import { A } from 'flowbite-svelte';
    import type { Transfer } from '$lib/data/types';
	import { getNFD } from '$lib/utils/nfd';

    export let tokenId: string;
    export let contractId: string;
    let transfers: Transfer[] = [];
    let nfdMap: any = {};

    let zeroAddress = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";
    $: isMobile = false;

    const getTransfers = async (contractId: string, tokenId: string): Promise<Transfer[]> => {
        if (contractId) {
            const url = `https://arc72-idx.voirewards.com/nft-indexer/v1/transfers/?contractId=${contractId}&tokenId=${tokenId}`;
            try {
                const data = await fetch(url).then((response) => response.json());

                return data.transfers.map((transfer: any) => {
                    return {
                        transactionId: transfer.transactionId,
                        contractId: transfer.contractId,
                        tokenId: transfer.tokenId,
                        from: transfer.fromAddr,
                        to: transfer.toAddr,
                        round: transfer.round,
                        timestamp: transfer.timestamp,
                    };
                });
            }
            catch(err) {
                console.error(err);
            }
        }
        return [];
    }

    const formatAddr = (addr: string) => {
        return addr.length > 16 ? `${addr.slice(0, 8)}...${addr.slice(-8)}` : addr;
    }

    onMount(async () => {
        isMobile = Device.isMobile;

        transfers = await getTransfers(contractId, tokenId);
        
        // get NFDs
        let addresses = new Set();
        transfers.forEach(t => {
            addresses.add(t.from);
            addresses.add(t.to);
        });

        const nfd = await getNFD(Array.from(addresses) as string[]);

        // create a key/value pair array of n.key to n.replacementValue
        nfdMap = nfd.reduce((acc: any, n: any) => {
            acc[n.key] = n.replacementValue;
            return acc;
        }, {}); 
    });

</script>
<div class="flex" class:flex-col={isMobile}>
    <div class="w-full overflow-hidden rounded-lg shadow-xs">
        <div class="w-full overflow-x-auto">
            <table class="w-full whitespace-no-wrap">
                <thead>
                    <tr class="text-xs font-semibold tracking-wide text-left text-gray-500 dark:text-gray-100 uppercase border-b bg-gray-50 dark:bg-gray-700">
                        <th class="px-4 py-3">Date</th>
                        {#if !isMobile}
                            <th class="px-4 py-3">Transaction ID</th>
                            <th class="px-4 py-3">Round</th>
                        {/if}
                        <th class="px-4 py-3">From</th>
                        <th class="px-4 py-3">To</th>
                    </tr>
                </thead>
                <tbody class="bg-white dark:bg-gray-700 divide-y">
                    {#each transfers as transfer}
                        <tr class="text-gray-700 dark:text-gray-100">
                            <td class="px-4 py-3">{new Date(transfer.timestamp * 1000).toLocaleString()}</td>
                            {#if !isMobile}
                                <td class="px-4 py-3"><A href="https://voi.observer/explorer/transaction/{transfer.transactionId}" target="_blank">{transfer.transactionId.substring(0,15)}...</A></td>
                                <td class="px-4 py-3"><A href="https://voi.observer/explorer/block/{transfer.round.toString()}" target="_blank">{transfer.round}</A></td>
                            {/if}
                            <td class="px-4 py-3 flex">
                                {#if transfer.from == zeroAddress}
                                    <span class="text-center w-full text-sm bg-yellow-200 rounded-lg text-yellow-400 font-bold p-1 pl-2 pr-2">Minted</span>
                                {:else}
                                    <A href='/arc72/portfolio/{transfer.from}'>{nfdMap[transfer.from] ? nfdMap[transfer.from] : formatAddr(transfer.from)}</A>
                                {/if}
                            </td>
                            <td class="px-4 py-3"><A href='/arc72/portfolio/{transfer.to}'>{nfdMap[transfer.to] ? nfdMap[transfer.to] : formatAddr(transfer.to)}</A></td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
</div>