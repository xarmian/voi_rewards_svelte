<script lang="ts">
    import type { Token, Collection } from '$lib/data/types';
	import WalletSearch from '$lib/component/WalletSearch.svelte';
	import { onMount } from 'svelte';
    import CollectionComponent from '$lib/component/ui/Collection.svelte';
    
    $: selectedAddress = '';
    let collections: Collection[] = [];

    onMount(() => {
        getCollections();
    });

    const onSearch = (addr: string) => {
        console.log(addr);
        selectedAddress = addr;
        getTokens();
    }

    const getCollections = async () => {
        let url = `https://arc72-idx.voirewards.com/nft-indexer/v1/collections`;

        try {
            const data = await fetch(url, { cache: 'no-store' }).then((response) => response.json());
            collections = data.collections;
        }
        catch(err) {
            console.error(err);
        }
    }

    const getTokens = async () => {
        let url = `https://arc72-idx.voirewards.com/nft-indexer/v1/tokens`;

        if (selectedAddress.length > 0) {
            url += `?owner=${selectedAddress}`;
        }

        try {
            const data = await fetch(url, { cache: 'no-store' }).then((response) => response.json());
            console.log(data);
        }
        catch(err) {
            console.error(err);
        }
    }
</script>

<div>
    <header class="bg-gray-100 dark:bg-gray-800 py-4 px-8 flex">
        <h1 class="text-2xl font-bold">ARC-72 NFT Explorer</h1>
        <div class="flex-grow">
            <!--<WalletSearch onSubmit={onSearch} loadPreviousValue={false}/>-->
        </div>
    </header>
    <br />
    <div class="flex flex-wrap justify-center">
        {#each collections as collection}
            <div class="inline-block">
                <CollectionComponent styleClass="m-16" collection={collection} selectedAddress={selectedAddress}></CollectionComponent>
            </div>
        {/each}
    </div>
</div>
