<script lang="ts">
	import type { PageData } from './$types';
    import type { Token } from '$lib/data/types';
	import { onMount } from 'svelte';
    import { Breadcrumb, BreadcrumbItem } from 'flowbite-svelte';
    import { HomeOutline, ChevronDoubleRightOutline } from 'flowbite-svelte-icons';
	import TokenCard from '$lib/component/ui/TokenCard.svelte';
    import BreadcrumbCustom from '$lib/component/ui/BreadcrumbCustom.svelte';
    //@ts-ignore
    import { mp as Contract } from 'ulujs';
    import { algodClient, algodIndexer } from '$lib/utils/algod';

    export let data: PageData;
    let contractId = data.contractId;
    let tokens = [] as Token[];
    let collectionName = '';
    const zeroAddress = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";

    onMount(() => {
        getTokens();
    });

    const getMarketplaceData = async (token: Token) => {
        if (token.approved == zeroAddress || token.approved == token.owner) return null;
        console.log(token);

        try {
            // Search for transactions involving the escrow account
            let transactions = await algodIndexer.searchForTransactions().address(token.approved).txType('appl').do();
            let contractId = null;
            console.log(transactions);

            for(let tx of transactions.transactions) {
                if (tx['tx-type'] === 'appl') {
                    console.log(`Found application call transaction: ${tx.id}`);
                    console.log(`Application ID involved: ${tx['application-transaction']['application-id']}`);
                    contractId = tx['application-transaction']['application-id'];
                    break;
                }
            }

            if (contractId == null) return null;

            const ctc = new Contract(contractId,algodClient,algodIndexer);
            const escrowData = await ctc.getEvents();
            console.log(escrowData);

        } catch (error) {
            console.error('Error searching transactions:', error);
        }
        return null;
    }

    const getTokens = async () => {
        if (contractId) {
            const url = `https://arc72-idx.voirewards.com/nft-indexer/v1/tokens?contractId=${contractId}`;
            try {
                const data = await fetch(url).then((response) => response.json());
                if (data.tokens.length > 0) {
                    tokens = data.tokens.map((token: any) => {
                        const metadata = JSON.parse(token.metadata);
                        
                        return {
                            contractId: token.contractId,
                            tokenId: token.tokenId,
                            owner: token.owner,
                            metadataURI: token.metadataURI,
                            metadata: metadata,
                            mintRound: token['mint-round'],
                            approved: token.approved,
                            //marketId: token.marketId,
                        }
                    });
                    collectionName = tokens[0].metadata.name.replace(/[1#]/g, '');

                    // for each token in tokens, get the marketplace data
                    for (let token of tokens) {
                        let mpData = await getMarketplaceData(token);
                        if (mpData) break;
                    }

                    tokens = tokens;
                }

            }
            catch(err) {
                console.error(err);
            }

            /*try {
                const nfd = await getNFD([walletId]); // nfd is array of objects with key = owner, replacementValue = nfd
                const nfdObj: any = nfd.find((n: any) => n.key === walletId);
                if (nfdObj) {
                    walletNFD = nfdObj.replacementValue;
                }

            }
            catch(err) {
                console.error(err);
            }*/
        }
    }
</script>

<BreadcrumbCustom aria-label="Navigation breadcrumb" solidClass="flex px-5 py-3 text-gray-700 border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700 justify-between" solid>
    <BreadcrumbItem href="/arc72" class="hover:text-blue-800" >
        <svelte:fragment slot="icon">
            <HomeOutline class="w-4 h-4 me-2 inline" />
          </svelte:fragment>Home
    </BreadcrumbItem>
    <BreadcrumbItem href="/arc72/collection/{contractId}" class="hover:text-blue-800">
        <svelte:fragment slot="icon">
            <ChevronDoubleRightOutline class="w-4 h-4 me-2 inline" />
          </svelte:fragment>Collection ({collectionName})
    </BreadcrumbItem>
    <svelte:fragment slot="right">
        <div></div>
    </svelte:fragment>
</BreadcrumbCustom>
<div class="flex flex-wrap justify-center">
    {#each tokens as token}
        <div class="p-4">
            <TokenCard {token} />
        </div>
    {/each}
</div>
