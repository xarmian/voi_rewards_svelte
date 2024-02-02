<script lang="ts">
    import type { Collection, Token } from '$lib/data/types';
	import WalletSearch from '$lib/component/WalletSearch.svelte';
	import { onMount } from 'svelte';
    import CollectionComponent from '$lib/component/ui/Collection.svelte';
    import TokenComponent from '$lib/component/ui/TokenDetail.svelte';
    import { goto } from '$app/navigation';
    import { viewCollection, tokenGroup } from '../../stores/collection';
    import { Modal } from 'flowbite-svelte';
    
    let collections: Collection[] = [];

    onMount(() => {
        getCollections();
    });

    const onSearch = (addr: string) => {
        goto(`/arc72/portfolio/${addr}`);
    }

    const getCollections = async () => {
        let url = `https://arc72-idx.voirewards.com/nft-indexer/v1/collections`;

        try {
            const data = await fetch(url).then((response) => response.json());
            collections = data.collections;
        }
        catch(err) {
            console.error(err);
        }
    }
</script>

<div>
    <div class="flex flex-wrap justify-center">
        {#each collections as collection}
            <div class="inline-block">
                <CollectionComponent styleClass="m-16" collection={collection}></CollectionComponent>
            </div>
        {/each}
    </div>
</div>
<Modal bind:open={$viewCollection} autoclose size='lg' outsideclose>
    {#each $tokenGroup as token}
        <div>
            <TokenComponent token={token}></TokenComponent>
        </div>
    {/each}
</Modal>
