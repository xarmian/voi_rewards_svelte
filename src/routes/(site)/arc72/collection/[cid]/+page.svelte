<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
    import type { Token } from '$lib/data/types';
	import { onMount } from 'svelte';
    import { getNFD } from '$lib/utils/nfd';
	import { A, Gallery } from 'flowbite-svelte';
    import { Card, Breadcrumb, BreadcrumbItem } from 'flowbite-svelte';
    import { HomeOutline, ChevronDoubleRightOutline } from 'flowbite-svelte-icons';
	import TokenCard from '$lib/component/ui/TokenCard.svelte';

    export let data: PageData;
    let contractId = data.contractId;
    let tokens = [] as Token[];
    let collectionName = '';

    onMount(() => {
        getTokens();
    });

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
                        }
                    });
                    collectionName = tokens[0].metadata.name.replace(/[1#]/g, '');
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

<Breadcrumb aria-label="Navigation breadcrumb" solid>
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
</Breadcrumb>
<div class="flex flex-wrap justify-center">
    {#each tokens as token}
        <div class="p-4">
            <TokenCard {token} />
        </div>
    {/each}
</div>
