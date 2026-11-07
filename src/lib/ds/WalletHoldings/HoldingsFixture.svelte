<script lang="ts">
	import WalletHoldings from './WalletHoldings.svelte';
	import { tokens } from './fixtures';
	const presenterOnly = new URL(location.href).searchParams.get('case') === 'address-identity';
	import PortfolioComponent from '$lib/component/PortfolioComponent.svelte';
	import { selectedWallet } from '$lib/chain/wallet.svelte';
	import type { Writable } from 'svelte/store';
	const fixtureSelection = selectedWallet as unknown as Writable<{ address: string; app: string }>;
	let signing = $state(true);
	let pageAddress = $state('Y');
	function toggle() {
		signing = !signing;
		fixtureSelection.set({ address: signing ? 'Y' : 'X', app: 'fixture' });
	}
</script>

<div class="mx-auto max-w-7xl p-4">
	<button onclick={toggle}>Toggle signing</button>
	<button onclick={() => (pageAddress = pageAddress === 'Y' ? 'B' : 'Y')}>Switch page</button>
	{#if presenterOnly}
		<WalletHoldings {pageAddress} {tokens} tokenState="ready" account={{ status: 'loading' }} />
	{:else}
		<PortfolioComponent
			walletAddress={pageAddress}
			holdingsSplit={{
				pageAddress: 'Y',
				owner: { address: 'Y', balance: 4 },
				contracts: [],
				contractSet: 'ready'
			}}
		/>
	{/if}
</div>
