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
</script>

<div class="flex">
    <img src={token.metadata.image} class="w-48 h-48 mr-3"/>
    <div class="">
        <div class="text-2xl font-bold mb-2">{token.metadata.name}</div>
        <div class="mb-2">Owned by <A href="https://voi.observer/explorer/account/{token.owner}" target="_blank">{formattedOwner}</A></div>
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