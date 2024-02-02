<script lang="ts">
	import { goto } from '$app/navigation';
    import type { Token } from '$lib/data/types';
    import { A, Card } from 'flowbite-svelte';

    export let token: Token = {} as Token;

    function chunkArray(array: any[], size: number): any[] {
        let result = [];
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size));
        }
        return result;
    }

    let tokenProps: any[] = [];
    tokenProps = Object.keys(token.metadata.properties).map((key) => {
        return { trait_type: key, value: token.metadata.properties[key as keyof typeof token.metadata.properties] };
    });

    let propGroups = chunkArray(tokenProps, 5);

    let flipped = false
	
	function flip(node: any, {
		delay = 0,
		duration = 500
	}) {
		return {
			delay,
			duration,
			css: (t: number, u: any) => `
				transform: rotateY(${1 - (u * 180)}deg);
				opacity: ${1 - u};
			`
		};
	}

    let url = `/arc72/collection/${token.contractId}/token/${token.tokenId}`;

</script>

<div class="card-container" on:mouseenter={() => flipped = true} on:mouseleave={() => flipped = false}>
    <div class="card">
        {#if flipped}
            <div class="side" transition:flip={{}}>
                <Card class="overflow-y cursor-pointer" style="height: 270px; width:240px;" on:click={() => goto(url)}>
                    <div class="text-2xl font-bold mb-2">{token.metadata.name}</div>
                    {#each tokenProps as prop}
                        <div class="text-sm">
                            <div class="font-bold inline">{prop.trait_type}</div>: {prop.value}
                        </div>
                    {/each}
                </Card>
            </div>
		{:else}
            <div class="side back" transition:flip={{}}>
                <Card>
                    <img src={token.metadata.image} alt={token.metadata.name} title={token.metadata.name} class="w-48 h-48" />
                    <div class="text-center">{token.metadata.name}</div>
                </Card>
            </div>
		{/if}
    </div>
</div>
<style>
.card-container {
    position: relative;
    height: 280px;
    width: 240px;
}

.card {
    width: 100%;
    height: 100%;
    position: absolute;
    perspective: 600;
}

.side {
    position: absolute;
    height: 100%;
    width: 100%;
    overflow: hidden;
    color: #42529e;
}
</style>