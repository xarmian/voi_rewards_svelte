<script lang="ts">
	import { connectedWallets, type Wallet } from '$lib/chain/wallet.svelte';
	import { pageAccountState } from '$lib/chain/signerGate';
	import { onMount } from 'svelte';
	import SearchBox from '../SearchBox/SearchBox.svelte';
	import Card from '../Card/Card.svelte';
	import { createResolver, type Resolver } from '../SearchBox/resolve';
	import { shortAddr } from '../format';
	let {
		onsubmit,
		resolver = createResolver()
	}: { onsubmit: (address: string) => void; resolver?: Resolver } = $props();
	let mounted = $state(false);
	const accounts = $derived(mounted ? signingAccounts($connectedWallets) : []);
	function signingAccounts(entries: readonly Wallet[]): Wallet[] {
		return [...new Set(entries.map((entry) => entry.address))].flatMap((address) => {
			const state = pageAccountState(address, entries);
			return state.state === 'yours' ? [state.signingEntry] : [];
		});
	}
	let recent: string[] = $state([]);
	let recentReady = $state(false);
	function loadRecents() {
		try {
			recent = resolver.recents();
		} catch {
			recent = [];
		}
		recentReady = true;
	}
	onMount(() => {
		mounted = true;
		loadRecents();
	});
</script>

<div class="min-w-0">
	<section class="on-hero bg-hero pb-24 pt-8 text-on-hero">
		<div class="container-page min-w-0 space-y-5">
			<h1 class="text-title">Check a wallet</h1>
			<p class="text-body">Rewards, contracts and holdings for any address.</p>
			<SearchBox
				variant="hero"
				id="wallet-search-hero"
				formLabel="Wallet search"
				placeholder="Wallet address or enVoi name"
				buttonLabel="Check"
				{resolver}
				{onsubmit}
			/>
		</div>
	</section>
	<div class="container-page relative -mt-[60px] min-w-0 pb-8">
		<div class="mx-auto max-w-3xl">
			{#if accounts.length}<div class="mb-bento">
					<Card title="Your accounts">
						<ul class="space-y-3">
							{#each accounts as account (account.address)}
								<li>
									<a
										class="break-all text-accent underline"
										href={`/wallet/${account.address}`}
										title={account.address}>{account.name ?? shortAddr(account.address)}</a
									>
								</li>
							{/each}
						</ul>
					</Card>
				</div>{/if}
			<Card title="Recent wallets">
				{#if !recentReady}<div aria-busy="true" class="space-y-3">
						<span class="sr-only">Loading recent wallets…</span>
						<div class="h-6 rounded-ds-xs bg-grid"></div>
						<div class="h-6 rounded-ds-xs bg-grid"></div>
					</div>
				{:else if recent.length}<ul class="space-y-3">
						{#each recent as address (address)}<li>
								<a
									class="break-all text-accent underline"
									href={`/wallet/${address}`}
									title={address}
									aria-label={`View wallet ${address}`}>{shortAddr(address)}</a
								>
							</li>{/each}
					</ul>
				{:else}<p class="text-label text-ink-muted">
						No recent wallets yet. Search an address or an enVoi name.
					</p>{/if}
			</Card>
		</div>
	</div>
</div>
