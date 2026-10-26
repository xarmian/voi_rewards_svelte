<script lang="ts">
	import type { PageData } from './$types';
	import type { Token } from '$lib/data/types';
	import { onMount } from 'svelte';
	import { Breadcrumb, BreadcrumbItem } from 'flowbite-svelte';
	import { HomeOutline, ChevronDoubleRightOutline } from 'flowbite-svelte-icons';
	import TokenCard from '$lib/component/ui/TokenCard.svelte';
	import BreadcrumbCustom from '$lib/component/ui/BreadcrumbCustom.svelte';
	//@ts-ignore
	import { algodClient, algodIndexer } from '$lib/utils/algod';

	export let data: PageData;
	let contractId = data.contractId;
	let tokens = [] as Token[];
	let collectionName = '';
	const zeroAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';

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
							approved: token.approved
						};
					});
					collectionName = tokens[0].metadata.name.replace(/[1#]/g, '');

					// for each token in tokens, get the marketplace data

					tokens = tokens;
				}
			} catch (err) {
				console.error(err);
			}
		}
	};
</script>

<BreadcrumbCustom
	aria-label="Navigation breadcrumb"
	solidClass="flex px-5 py-3 text-gray-700 border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700 justify-between"
	solid
>
	<BreadcrumbItem href="/arc72" class="hover:text-blue-800">
		<svelte:fragment slot="icon">
			<HomeOutline class="w-4 h-4 me-2 inline" />
		</svelte:fragment>Home
	</BreadcrumbItem>
	<BreadcrumbItem href="/arc72/collection/{contractId}" class="hover:text-blue-800">
		<svelte:fragment slot="icon">
			<ChevronDoubleRightOutline class="w-4 h-4 me-2 inline" />
		</svelte:fragment>Collection ({collectionName})
	</BreadcrumbItem>
	<svelte:fragment slot="right">
		<div></div>
	</svelte:fragment>
</BreadcrumbCustom>
<div class="flex flex-wrap justify-center">
	{#each tokens as token}
		<div class="p-4">
			<TokenCard {token} />
		</div>
	{/each}
</div>
