<script lang="ts">
	import { goto } from '$app/navigation';
    import type { Token } from '$lib/data/types';
    import { A, Card } from 'flowbite-svelte';

    export let token: Token = {} as Token;

    let tokenProps: any[] = [];
    tokenProps = Object.keys(token.metadata.properties).map((key) => {
        return { trait_type: key, value: token.metadata.properties[key as keyof typeof token.metadata.properties] };
    });

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

    let infourl = `/arc72/collection/${token.contractId}/token/${token.tokenId}`;
    let marketurl = `https://shellyssandbox.xyz/#/nft/collection/${token.contractId}/token/${token.tokenId}`;
    let contracturl = `https://explorer.voi.network/explorer/application/${token.contractId}/transactions`;

</script>

<div class="card-container" on:mouseenter={() => flipped = true} on:mouseleave={() => flipped = false}>
    <div class="card">
        {#if flipped}
            <div class="side" transition:flip={{}}>
                <Card class="flex justify-between" style="height: 270px; width:240px;">
                    <div class="overflow-auto h-5/6">
                        <div class="text-2xl font-bold mb-2"><A on:click={() => goto(infourl)}>{token.metadata.name}</A></div>
                        {#each tokenProps as prop}
                            <div class="text-sm">
                                <div class="font-bold inline">{prop.trait_type}</div>: {prop.value}
                            </div>
                        {/each}
                    </div>
                    <hr class="w-full my-2"/>
                    <div class="flex justify-between">
                        <div class="text-center">
                            <button class="cursor-pointer p-1 bg-blue-400 hover:bg-blue-500 text-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 w-14" on:click={() => window.open(marketurl,'_blank')}>
                                <i class="fas fa-store" aria-details="Marketplace"></i>
                                <div class="text-xs">Market</div>
                            </button>
                        </div>
                        <div class="text-center">
                            <button class="cursor-pointer p-1 bg-blue-400 hover:bg-blue-500 text-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 w-14" on:click={() => goto(infourl)}>
                                <i class="fas fa-info-circle" aria-details="Info"></i>
                                <div class="text-xs">Detail</div>
                            </button>
                        </div>
                        <div class="text-center">
                            <button class="cursor-pointer p-1 bg-blue-400 hover:bg-blue-500 text-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 w-14" on:click={() => window.open(contracturl,'_blank')}>
                                <i class="fas fa-file-contract" aria-details="Contract"></i>
                                <div class="text-xs">Contract</div>
                            </button>
                        </div>
                    </div>
                </Card>
            </div>
		{:else}
            <div class="side back" transition:flip={{}}>
                <Card padding="none">
                    <img src={token.metadata.image} alt={token.metadata.name} title={token.metadata.name} class="rounded-t-lg"/>
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