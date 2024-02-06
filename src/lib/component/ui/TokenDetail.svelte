<script lang="ts">
	import { goto } from '$app/navigation';
    import type { Token, Collection } from '$lib/data/types';
	import { getNFD } from '$lib/utils/nfd';
    import { A } from 'flowbite-svelte';
	import { onMount } from 'svelte';
    export let token: Token;
    //@ts-ignore
    import Device from 'svelte-device-info';

    $: isMobile = false;
    $: formattedOwner = '';
    let collection: Collection | undefined;

    let isMenuOpen = false;

    function toggleMenu() {
        isMenuOpen = !isMenuOpen;
    }

    const getCollection = async (contractId: number) => {
        if (contractId) {
            const url = `https://arc72-idx.voirewards.com/nft-indexer/v1/collections/?contractId=${contractId}`;
            try {
                const data = await fetch(url).then((response) => response.json());
                if (data.collections && data.collections.length > 0) {
                    collection = data.collections[0];
                }
            }
            catch(err) {
                console.error(err);
            }
        }
    }

    const goToMarketplace = () => {
        window.open(`https://shellyssandbox.xyz/#/nft/collection/${token.contractId}/token/${token.tokenId}`,'_blank');
    }

    const goToContract = () => {
        window.open(`https://voi.observer/explorer/application/${token.contractId}/transactions`, '_blank');
    }

    const goToProjectPage = () => {
        //window.location.href = token.metadata.image;
    }

    const goToCollection = () => {
        goto(`/arc72/collection/${token.contractId}`);
    }

    onMount(async () => {
        isMobile = Device.isMobile;

        if (token) {
            getCollection(token.contractId);

            const nfd = await getNFD([token.owner]); // nfd is array of objects with key = owner, replacementValue = nfd
            const nfdObj: any = nfd.find((n: any) => n.key === token?.owner);
            if (nfdObj) {
                token.ownerNFD = nfdObj.replacementValue;
            }
        }

        formattedOwner = token.ownerNFD ? token.ownerNFD as string : token.owner.length > 16
        ? `${token.owner.slice(0, 8)}...${token.owner.slice(-8)}`
        : token.owner;
    });

    let tokenProps: any[] = [];
    // map token.metadata.properties object of the form {"BACKGROUND":"Aquamarine","BODY":"Red","ON BODY":"Scar"}
    // to an array of objects of the form {trait_type: "BACKGROUND", value: "Aquamarine"}
    tokenProps = Object.keys(token.metadata.properties).map((key) => {
        const colors = propColor(token.metadata.properties[key as keyof typeof token.metadata.properties]);
        return { trait_type: key, value: token.metadata.properties[key as keyof typeof token.metadata.properties], fgcolor: colors[1], bgcolor: colors[0]};
    });

    //let propGroups = chunkArray(tokenProps, 5);

    function chunkArray(array: any[], size: number): any[] {
        let result = [];
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size));
        }
        return result;
    }

    // return a tuple of the bg color from bgcolor if value is in the bgcolor array, and its corresponding fg color
    // if value is not in the bgcolors array, return a random bgcolor and its corresponding foreground color
    function propColor(value: string) {
        const bgcolors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Cyan', 'Magenta', 'Black', 'White', 'Gray', 'Pink', 'Brown', 'Dark Grey', 'YBG', 'Gold', 'Lavender', 'Aquamarine'];

        // create a list of softer background colors
        const softBgColors = ['#F08080', '#87CEFA', '#90EE90', '#FFFFE0', '#DDA0DD', '#AFEEEE', '#FFC0CB', '#D3D3D3', '#F5F5F5', '#DCDCDC', '#FFB6C1', '#FFE4C4', '#778899',
            '#FFD700',
            '#FFE000',
            '#E6E6FA',
            '#7FFFD4'
        ];

        // create a list of softer foreground colors
        const softFgColors = ['#8B0000', '#00008B', '#006400', '#FFD700', '#4B0082', '#008B8B', '#FF1493', '#696969', '#A9A9A9', '#2F4F4F', '#FF1493', '#A0522D', '#2F4F4F',
            '#8B0000',
            '#8B0000',
            '#8B008B',
            '#006400'
        ];

        const index = bgcolors.includes(value) ? bgcolors.indexOf(value) : Math.floor(Math.random() * bgcolors.length);

        return [softBgColors[index], softFgColors[index]];
    }

    function closeMenu(event: any) {
        if (isMenuOpen && !event.target.closest('.hamburger-container')) {
            isMenuOpen = false;
        }
    }

    let formattedApproved = token.approved ? token.approved.length > 8
        ? `${token.approved.slice(0, 8)}...${token.approved.slice(-8)}`
        : token.approved : '';

    const collectionName = token?.metadata.name.replace(/(\d+|#)/g, '')??'';
</script>
<svelte:window on:click={closeMenu} />
<div class="button-bar">
    {#if isMobile}
        <div class="hamburger-container">
            <button class="hamburger-button" on:click={toggleMenu}>
                <span class="hamburger-icon"></span>
                <span class="hamburger-icon"></span>
                <span class="hamburger-icon"></span>
            </button>
            {#if isMenuOpen}
                <div class="menu">
                    <button class="mb-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500" on:click={goToMarketplace}>Marketplace</button>
                    <button class="mb-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500" on:click={goToContract}>Contract</button>
                    <button class="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500" on:click={goToProjectPage}>Project Page</button>
                </div>
            {/if}
        </div>
    {:else}
        <button class="mr-2 mb-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500" on:click={goToCollection}><i class='fas fa-arrow-left'></i> Collection</button>
        <button class="mr-2 mb-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500" on:click={goToMarketplace}>Marketplace</button>
        <button class="mr-2 mb-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500" on:click={goToContract}>Contract</button>
        <button class="mr-2 mb-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500" on:click={goToProjectPage}>Project Page</button>
    {/if}
</div>
<div class="flex" class:flex-col={isMobile}>
    <img src={token.metadata.image} class="w-72 h-72 mr-3 rounded-xl"/>
    <div class="text-left">
        <div class="mb-2">
            {token.metadata?.description??''}
        </div>
        <div class="text-2xl font-bold mb-2 text-purple-900 dark:text-purple-100">{token.metadata.name}</div>
        <div class="mb-2">
            <div>Token ID: {token.tokenId}
            {#if collection}
                / {collection.totalSupply}
            {/if}
            </div>
            <div>Collection: <A href="/arc72/collection/{token.contractId}">{collectionName}</A></div>
            <div>Owned by: <A href="/arc72/portfolio/{token.owner}">{formattedOwner}</A></div>
            {#if token.approved && token.approved != 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'}
                <div>Approved Spender: <A href="/arc72/portfolio/{token.approved}">{formattedApproved}</A></div>
            {/if}
        </div>
        <div class="flex flex-wrap">
            {#each tokenProps as prop}
                <div style="color: {prop.fgcolor}; background-color: {prop.bgcolor}" class="p-2 m-1 text-md rounded-xl">{prop.trait_type}: {prop.value}</div>
            {/each}
        </div>
    </div>
</div>
<style>
    .button-bar {
        display: flex;
        justify-content:left;
        align-items: center;
        margin-bottom: 1rem;
    }
    button {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 0.5rem;
        cursor: pointer;
    }
    .hamburger-container {
        position: relative;
    }
    .hamburger-button {
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        width: 1.5rem;
        height: 1.5rem;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
        z-index: 10;
    }
    .hamburger-icon {
        width: 1.5rem;
        height: 0.2rem;
        background: #333;
    }
    .menu {
        position: absolute;
        top: 0rem;
        left: 2rem;
        background-color: #f0f0f0;
        border: 1px solid #e0e0e0;
        border-radius: 0.5rem;
        padding: 0.5rem;
        display: flex;
        flex-direction: column;
        z-index: 9;
        white-space: nowrap;
    }
    @media (prefers-color-scheme: dark) {
        button {
            background-color: #333;
            color: #f0f0f0;
        }

        button:hover {
            background-color: #444;
        }
    }
</style>
