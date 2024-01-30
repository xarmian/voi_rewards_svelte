<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
    import type { Token } from '$lib/data/types';
    import TokenComponent from '$lib/component/ui/Token.svelte';
	import { onMount } from 'svelte';
    import { getNFD } from '$lib/utils/nfd';
	import { A } from 'flowbite-svelte';

    export let data: PageData;
    let walletId = data.walletId;
    let walletNFD: string | null = null;
    let tokens: Token[] = [];

    onMount(() => {
        getTokens();
    });

    const getTokens = async () => {
        let url = `https://arc72-idx.voirewards.com/nft-indexer/v1/tokens`;

        if (walletId.length > 0) {
            url += `?owner=${walletId}`;
        }

        try {
            const nfd = await getNFD([walletId]); // nfd is array of objects with key = owner, replacementValue = nfd
            const nfdObj: any = nfd.find((n: any) => n.key === walletId);
            if (nfdObj) {
                walletNFD = nfdObj.replacementValue;
            }

            const data = await fetch(url, { cache: 'no-store' }).then((response) => response.json());
            data.tokens.forEach((token: any) => {
                tokens.push({
                    contractId: token.contractId,
                    tokenId: token.tokenId,
                    owner: token.owner,
                    ownerNFD: walletNFD,
                    metadataURI: token.metadataURI,
                    metadata: JSON.parse(token.metadata),
                    mintRound: token['mint-round']
                });
            });

            tokens = tokens;
        }
        catch(err) {
            console.error(err);
        }
    }

</script>

<div class="float-left text-xl pl-6 cursor-pointer">
    <a on:click={() => goto('/arc72')} class="text-blue-500 hover:text-blue-800">&#8592; Collections</a>
</div>
<br/>
<br/>
<div class="text-center">
    <h2 class="font-bold text-3xl">Portfolio</h2>
    <div><A href="https://voi.observer/explorer/account/{walletId}" target="_blank">{walletNFD??walletId}</A></div>
</div>
<br/>
<div class="m-4">
    {#each tokens as token}
        <div class="m-4">
            <TokenComponent token={token}></TokenComponent>
        </div>
    {/each}
</div>