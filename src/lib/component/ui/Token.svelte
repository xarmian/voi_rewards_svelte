<script lang="ts">
    import type { Token } from '$lib/data/types';
    import { A } from 'flowbite-svelte';
    export let token: Token;

    let tokenProps: any[] = [];
    // map token.metadata.properties object of the form {"BACKGROUND":"Aquamarine","BODY":"Red","ON BODY":"Scar"}
    // to an array of objects of the form {trait_type: "BACKGROUND", value: "Aquamarine"}
    tokenProps = Object.keys(token.metadata.properties).map((key) => {
        return { trait_type: key, value: token.metadata.properties[key as keyof typeof token.metadata.properties] };
    });

    let formattedOwner = token.ownerNFD ? token.ownerNFD : token.owner.length > 8
        ? `${token.owner.slice(0, 8)}...${token.owner.slice(-8)}`
        : token.owner;
</script>

<div class="flex">
        <img src={token.metadata.image} class="w-48 h-48 mr-3"/>
        <div class="">
            <div class="text-2xl font-bold mb-2">{token.metadata.name}</div>
            <div class="mb-2">Owned by <A href="https://voi.observer/explorer/account/{token.owner}" target="_blank">{formattedOwner}</A></div>
            <div class="text-md">
                {#each tokenProps as prop}
                    <div>{prop.trait_type}: {prop.value}</div>
                {/each}
            </div>
        </div>
</div>