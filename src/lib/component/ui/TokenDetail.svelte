<script lang="ts">
    import type { Token } from '$lib/data/types';
    import { A } from 'flowbite-svelte';
	import { onMount } from 'svelte';
    export let token: Token;
    //@ts-ignore
    import Device from 'svelte-device-info';

    $: isMobile = false;

    onMount(async () => {
        isMobile = Device.isMobile;
    });

    let tokenProps: any[] = [];
    // map token.metadata.properties object of the form {"BACKGROUND":"Aquamarine","BODY":"Red","ON BODY":"Scar"}
    // to an array of objects of the form {trait_type: "BACKGROUND", value: "Aquamarine"}
    tokenProps = Object.keys(token.metadata.properties).map((key) => {
        return { trait_type: key, value: token.metadata.properties[key as keyof typeof token.metadata.properties] };
    });

    let propGroups = chunkArray(tokenProps, 5);

    function chunkArray(array: any[], size: number): any[] {
        let result = [];
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size));
        }
        return result;
    }

    let formattedOwner = token.ownerNFD ? token.ownerNFD : token.owner.length > 8
        ? `${token.owner.slice(0, 8)}...${token.owner.slice(-8)}`
        : token.owner;
    let formattedApproved = token.approved ? token.approved.length > 8
        ? `${token.approved.slice(0, 8)}...${token.approved.slice(-8)}`
        : token.approved : '';

    const collectionName = token?.metadata.name.replace(/(\d+|#)/g, '')??'';
</script>

<div class="flex" class:flex-col={isMobile}>
    <img src={token.metadata.image} class="w-72 h-72 mr-3"/>
    <div class="text-left">
        <div class="text-2xl font-bold mb-2 text-purple-900 dark:text-purple-100">{token.metadata.name}</div>
        <div class="mb-2">
            <div>Token ID: {token.tokenId}</div>
            <div>Collection: <A href="/arc72/collection/{token.contractId}">{collectionName}</A></div>
            <div>Owned by: <A href="/arc72/portfolio/{token.owner}">{formattedOwner}</A></div>
            {#if token.approved && token.approved != 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'}
                <div>Approved Spender: <A href="/arc72/portfolio/{token.approved}">{formattedApproved}</A></div>
            {/if}
        </div>
        <div class="flex flex-wrap">
            {#each propGroups as group (group)}
                <div class="mr-5">
                    {#each group as prop (prop.trait_type)}
                        <div class="text-md">{prop.trait_type}: {prop.value}</div>
                    {/each}
                </div>
            {/each}
        </div>
    </div>
</div>