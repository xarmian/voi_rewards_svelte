<script lang="ts">
    import { A } from 'flowbite-svelte';
    import type { Token, Collection } from '$lib/data/types';
	import WalletSearch from '$lib/component/WalletSearch.svelte';
	import { onMount } from 'svelte';
    import CollectionComponent from '$lib/component/ui/Collection.svelte';
    import { tokenGroup } from '../../../stores/collection';
    import { viewCollection } from '../../../stores/collection';
	import TokenComponent from '$lib/component/ui/Token.svelte';
    import { Modal } from 'flowbite-svelte';

    $: selectedAddress = '';
    let collections: Collection[] = [];

    onMount(() => {
        getTokens();
    });

    const onSearch = (addr: string) => {
        console.log(addr);
        selectedAddress = addr;
        getTokens();
    }

    const getTokens = async () => {
        let url = `https://arc72-idx.voirewards.com/nft-indexer/v1/collections`;

        try {
            const data = await fetch(url, { cache: 'no-store' }).then((response) => response.json());
            collections = data.collections;

            /*data.tokens.map((token: any) => {
                const t: Token = {
                        contractId: token.contractId,
                        tokenId: token.tokenId,
                        owner: token.owner,
                        metadataURI: token.metadataURI,
                        metadata: JSON.parse(token.metadata),
                        mintRound: token['mint-round']
                    }
                if (!collections[t.contractId]) {
                    collections[t.contractId] = {
                        contractId: t.contractId,
                        totalSupply: 0,
                        mintRound: 0,
                        tokens: []
                    }
                }
                else {
                    collections[t.contractId].tokens.push(t);
                }
            });*/
        }
        catch(err) {
            console.error(err);
        }
    }
</script>

<div>
    <header class="bg-gray-100 dark:bg-gray-800 py-4 px-8 flex">
        <h1 class="text-2xl font-bold">ARC-72 NFT Explorer</h1>
        <!--<div class="flex-grow">
            <WalletSearch onSubmit={onSearch}/>
        </div>-->
    </header>
    <br />
    <div class="flex flex-wrap justify-center">
        {#each collections as collection}
            <div class="inline-block">
                <CollectionComponent styleClass="m-16" collection={collection} selectedAddress={selectedAddress}></CollectionComponent>
            </div>
        {/each}
    </div>
    <Modal bind:open={$viewCollection} autoclose size='lg' outsideclose>
        {#each $tokenGroup as token}
            <div>
                <TokenComponent token={token}></TokenComponent>
            </div>
        {/each}
    </Modal>
</div>
