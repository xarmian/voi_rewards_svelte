<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
    import type { Token } from '$lib/data/types';
    import TokenComponent from '$lib/component/ui/TokenDetail.svelte';
	import { onMount } from 'svelte';
    import { getNFD } from '$lib/utils/nfd';
	import { A } from 'flowbite-svelte';
    import { Tabs, TabItem, Indicator, Breadcrumb, BreadcrumbItem } from 'flowbite-svelte';
    import { HomeOutline, ChevronDoubleRightOutline } from 'flowbite-svelte-icons';

    export let data: PageData;
    let walletId = data.walletId;
    let walletNFD: string | null = null;
    let tokens: Token[] = [];
    let approvals: Token[] = [];
    let isLoaded = false;

    let viewPortfolio = true;
    let viewApprovals = false;

    onMount(() => {
        getTokens();
    });

    const getTokens = async () => {
        try {
            const nfd = await getNFD([walletId]); // nfd is array of objects with key = owner, replacementValue = nfd
            const nfdObj: any = nfd.find((n: any) => n.key === walletId);
            if (nfdObj) {
                walletNFD = nfdObj.replacementValue;
            }

            // owned tokens
            const url = `https://arc72-idx.voirewards.com/nft-indexer/v1/tokens?owner=${walletId}`;
            const data = await fetch(url).then((response) => response.json());
            data.tokens.forEach((token: any) => {
                tokens.push({
                    contractId: token.contractId,
                    tokenId: token.tokenId,
                    owner: token.owner,
                    ownerNFD: walletNFD,
                    metadataURI: token.metadataURI,
                    metadata: JSON.parse(token.metadata),
                    mintRound: token['mint-round'],
                    approved: token.approved,
                    marketData: undefined,
                });
            });

            // approved tokens
            const aurl = `https://arc72-idx.voirewards.com/nft-indexer/v1/tokens?approved=${walletId}`;
            const adata = await fetch(aurl).then((response) => response.json());
            adata.tokens.forEach((token: any) => {
                approvals.push({
                    contractId: token.contractId,
                    tokenId: token.tokenId,
                    owner: token.owner,
                    ownerNFD: walletNFD,
                    metadataURI: token.metadataURI,
                    metadata: JSON.parse(token.metadata),
                    mintRound: token['mint-round'],
                    approved: token.approved,
                    marketData: undefined,
                });
            });

            tokens = tokens;
            approvals = approvals;
            isLoaded = true;
        }
        catch(err) {
            console.error(err);
        }
    }

    let formattedWallet = walletId.length > 8
        ? `${walletId.slice(0, 8)}...${walletId.slice(-8)}`
        : walletId;
</script>

<Breadcrumb aria-label="Navigation breadcrumb" solid>
    <BreadcrumbItem href="/arc72" class="hover:text-blue-800" >
        <svelte:fragment slot="icon">
            <HomeOutline class="w-4 h-4 me-2 inline" />
          </svelte:fragment>Collections
    </BreadcrumbItem>
    <BreadcrumbItem href="/arc72/portfolio/{walletId}" class="hover:text-blue-800">
        <svelte:fragment slot="icon">
            <ChevronDoubleRightOutline class="w-4 h-4 me-2 inline" />
          </svelte:fragment>Portfolio (<A href="https://explorer.voi.network/explorer/account/{walletId}" target="_blank">{walletNFD??formattedWallet}</A>)
    </BreadcrumbItem>
</Breadcrumb>
<div class="text-center">
    <!--<div><A href="https://explorer.voi.network/explorer/account/{walletId}" target="_blank">{walletNFD??walletId}</A></div>-->
    <Tabs style="underline" defaultClass="flex rounded-lg divide-x rtl:divide-x-reverse divide-gray-200 shadow dark:divide-gray-700 justify-center">
        <TabItem open>
            <div slot="title">
                <div class="inline">Portfolio</div>
                <Indicator color="blue" size="xl" class="text-xs font-bold text-white">{tokens.length}</Indicator>
            </div>
            <div class="m-4">
                {#each tokens as token}
                    <div class="m-4">
                        <TokenComponent token={token}></TokenComponent>
                    </div>
                {/each}
                {#if isLoaded && tokens.length == 0}
                    <div class="text-2xl font-bold">No tokens found! Want to get some? <A href="https://shellyssandbox.xyz/" target="_blank">Check out the ARC-72 Marketplace</A></div>
                {/if}
            </div>
        </TabItem>
        <TabItem>
            <div slot="title">
                <div class="inline">Approvals</div>
                <Indicator color="blue" size="xl" class="text-xs font-bold text-white">{approvals.length}</Indicator>
            </div>
            <div class="m-4">
                {#each approvals as token}
                    <div class="m-4">
                        <TokenComponent token={token}></TokenComponent>
                    </div>
                {/each}
                {#if isLoaded && approvals.length == 0}
                    <div class="text-2xl font-bold">No approvals found.</div>
                {/if}
            </div>
        </TabItem>
        <TabItem>
            <div slot="title">
                <div class="inline">Manage</div>
                <Indicator class="invisible" size="xl">&nbsp;</Indicator>
            </div>
            <div class="m-4">
                <div class="text-2xl font-bold">Coming soon!</div>
            </div>
        </TabItem>
    </Tabs>
</div>