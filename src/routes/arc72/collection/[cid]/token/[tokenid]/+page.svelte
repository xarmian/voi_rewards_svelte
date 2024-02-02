<script lang="ts">
	import type { PageData } from './$types';
    import type { Token } from '$lib/data/types';
	import { onMount } from 'svelte';
    import { Breadcrumb, BreadcrumbItem } from 'flowbite-svelte';
    import { HomeOutline, ChevronDoubleRightOutline } from 'flowbite-svelte-icons';
	import TokenDetail from '$lib/component/ui/TokenDetail.svelte';
	import { getNFD } from '$lib/utils/nfd';

    export let data: PageData;
    let contractId = data.contractId;
    let tokenId = data.tokenId;
    let token = undefined as Token | undefined;

    let tokenName = '';
    let collectionName = '';

    onMount(() => {
        getToken();
    });

    const getToken = async () => {
        if (contractId && tokenId) {
            const url = `https://arc72-idx.voirewards.com/nft-indexer/v1/tokens?contractId=${contractId}&tokenId=${tokenId}`;
            try {
                const data = await fetch(url).then((response) => response.json());
                if (data.tokens.length > 0) {
                    let tokens = data.tokens.map((token: any) => {
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
                    token = tokens[0];
                    tokenName = token?.metadata.name??'';
                    collectionName = token?.metadata.name.replace(/(\d+|#)/g, '')??'';
                }


            }
            catch(err) {
                console.error(err);
            }

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
    <BreadcrumbItem href="/arc72/collection/{contractId}/token/{tokenId}" class="hover:text-blue-800">
        <svelte:fragment slot="icon">
            <ChevronDoubleRightOutline class="w-4 h-4 me-2 inline" />
          </svelte:fragment>{tokenName}
    </BreadcrumbItem>
</Breadcrumb>
<div class="m-10">
    {#if token}
        <TokenDetail {token} />
    {/if}
</div>