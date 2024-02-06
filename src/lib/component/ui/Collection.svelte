<script lang="ts">
    import type { Token, Collection } from '$lib/data/types';
	import { onMount } from 'svelte';
    import { Card } from 'flowbite-svelte';
    import { getNFD } from '$lib/utils/nfd';
    import { viewCollection, tokenGroup } from '../../../stores/collection';
	import { goto } from '$app/navigation';

    export let collection: Collection;
    export let selectedAddress: string = '';
    export let styleClass = '';
    let tokens: Token[] = [];
    $: holders = [...new Set(tokens.map((t) => t.owner))]; // unique holders

    onMount(() => {
        getTokens();
    });

    async function getTokens() {
        let url = `https://arc72-idx.voirewards.com/nft-indexer/v1/tokens/?contractId=${collection.contractId}`;
        if (selectedAddress.length > 0) {
            url += `?owner=${selectedAddress}`;
        }

        try {
            const data = await fetch(url).then((response) => response.json());
            tokens = data.tokens.map((token: any) => {
                return {
                    contractId: token.contractId,
                    tokenId: token.tokenId,
                    owner: token.owner,
                    metadataURI: token.metadataURI,
                    metadata: JSON.parse(token.metadata),
                    mintRound: token['mint-round'],
                    approved: token.approved,
                }
            });

        }
        catch(err) {
            console.error(err);
        }
    }

    async function displayCollection(c: Collection) {
        goto(`/arc72/collection/${c.contractId}`);
        return;

        let owners = [...new Set(tokens.map((t: Token) => t.owner))];

        if (owners.length > 0) {
            const nfd: any = await getNFD(owners); // nfd is array of objects with key = owner, replacementValue = nfd

            // for each token, replace owner with nfd replacementValue
            tokens = tokens.map((t: Token) => {
                const nfdObj = nfd.find((n: any) => n.key === t.owner);
                if (nfdObj) {
                    t.ownerNFD = nfdObj.replacementValue;
                }
                return t;
            });
        }

        tokenGroup.set(tokens);
        viewCollection.set(true);
    }
</script>

<div class="relative cursor-pointer transform hover:scale-110 transition-transform duration-200" on:click={() => displayCollection(collection)}>
    {#if tokens && tokens.length >= 1}
        <div class="{styleClass}">
            <div class="flex justify-center -space-x-36 group-hover:-space-x-48 transition-all duration-500">
                <div class="transform -rotate-12 z-30">
                    <Card padding="none" class="rounded-xl">
                        <img src={tokens[0].metadata.image} class="w-48 h-48 rounded-xl" />
                    </Card>
                </div>
                <div class="z-20">
                    <Card padding="none" class="rounded-xl">
                        {#if tokens.length >= 2}
                            <img src={tokens[1].metadata.image} class="w-48 h-48 rounded-xl" />
                        {:else}
                            <div class="w-48 h-48"></div>
                        {/if}
                    </Card>
                </div>
                <div class="transform rotate-12 z-10">
                    <Card padding="none" class="rounded-xl">
                        {#if tokens.length >= 3}
                            <img src={tokens[2].metadata.image} class="w-48 h-48 rounded-xl" />
                        {:else}
                            <div class="w-48 h-48"></div>
                        {/if}
                    </Card>
                </div>
            </div>    
        </div>
        <div class="absolute top-0 left-0 bg-black bg-opacity-50 text-white p-4 z-40 rounded-md">
            <div>{tokens[0].metadata.name.replace(/[1#]/g, '')}</div>
            <div>ID: {tokens[0].contractId}</div>
            <div>Tokens: {tokens.length}</div>
            <div>Unique holders: {holders.length}</div>
        </div>
    {/if}
</div>