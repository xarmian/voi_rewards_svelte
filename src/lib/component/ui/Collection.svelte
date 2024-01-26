<script lang="ts">
    import type { Token, Collection } from '$lib/data/types';
	import { onMount } from 'svelte';
    import { Card } from 'flowbite-svelte';
	import { tokenGroup, viewCollection } from '../../../stores/collection';
    import { getNFD } from '$lib/utils/nfd';

    export let collection: Collection;
    export let selectedAddress: string = '';
    export let styleClass = '';
    let tokens: Token[] = [];

    onMount(() => {
        getTokens();
    });

    async function getTokens() {
        let url = `https://arc72-idx.voirewards.com/nft-indexer/v1/tokens/?contractId=${collection.contractId}`;
        if (selectedAddress.length > 0) {
            url += `?owner=${selectedAddress}`;
        }

        try {
            const data = await fetch(url, { cache: 'no-store' }).then((response) => response.json());
            tokens = data.tokens.map((token: any) => {
                return {
                    contractId: token.contractId,
                    tokenId: token.tokenId,
                    owner: token.owner,
                    metadataURI: token.metadataURI,
                    metadata: JSON.parse(token.metadata),
                    mintRound: token['mint-round']
                }
            });

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

        }
        catch(err) {
            console.error(err);
        }
    }

    function displayCollection() {
        tokenGroup.set(tokens);  
        viewCollection.set(true);  
    }
</script>

<div>
{#if tokens && tokens.length >= 3}
    <div class="{styleClass}" on:click={displayCollection}>
        <div class="flex justify-center -space-x-64 group-hover:-space-x-48 transition-all duration-500">
            <div class="transform -rotate-12 z-40">
                <Card>
                    <img src={tokens[0].metadata.image} class="w-48 h-48" />
                </Card>
            </div>
            <div class="z-30">
                <Card>
                    <img src={tokens[1].metadata.image} class="w-48 h-48" />
                </Card>
            </div>
            <div class="transform rotate-12 z-20">
                <Card>
                    <img src={tokens[2].metadata.image} class="w-48 h-48" />
                </Card>
            </div>
        </div>    
    </div>
{/if}
</div>