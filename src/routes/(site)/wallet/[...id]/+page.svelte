<script lang="ts">
	import { Web3Wallet, type ConnectedAccount } from 'avm-wallet-svelte';
	import { selectedWallet } from '$lib/chain/wallet.svelte';
	import { get } from 'svelte/store';
	import { pinnedFlows } from '$lib/chain/flowAccount';
	import { pickNavigation } from '$lib/utils/walletSelection';
	import { canSignFor } from '$lib/chain/signerGate';
	import { algodClient, algodIndexer } from '$lib/utils/algod';
	import { PUBLIC_WALLETCONNECT_PROJECT_ID as wcProjectId } from '$env/static/public';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onDestroy, onMount, untrack } from 'svelte';
	import {
		Button,
		Card,
		CopyButton,
		Headline,
		InlineAlert,
		SearchBox,
		StatusPill,
		Tabs,
		WalletOverview,
		createHashTabs,
		shortAddr,
		comma
	} from '$lib/ds';
	import { WALLET_TABS } from '$lib/ds/Tabs/hash';
	import type { DataState } from '$lib/ds';
	import { createWalletRouteSync } from '$lib/wallet/routeSync.svelte';
	import { summarizeWallet } from '$lib/wallet/summary';
	import { loadWallet, type LegacyAccount, type WalletSnapshot } from '$lib/wallet/load';
	import NodeComponent from '$lib/component/NodeComponent.svelte';
	import ProposalsComponent from '$lib/component/ProposalsComponent.svelte';
	import CalculatorComponent from '$lib/component/CalculatorComponent.svelte';
	import LockVestComponent from '$lib/component/LockVestComponent.svelte';
	import EpochComponent from '$lib/component/EpochComponent.svelte';
	import PortfolioComponent from '$lib/component/PortfolioComponent.svelte';

	let {
		data
	}: { data: { walletId: string | null; parentWalletId: string | null; hash?: string } } = $props();
	const walletId = $derived(data.walletId ?? '');
	const parentWalletId = $derived(data.parentWalletId);
	let panel: HTMLDivElement | undefined = $state();
	const tabs = createHashTabs({ ids: WALLET_TABS, panel: () => panel });
	const sections = WALLET_TABS.map((id) => ({
		id,
		label: id[0].toUpperCase() + id.slice(1),
		href: `#${id}`
	}));
	let snapshot = $state<WalletSnapshot | null>(null);
	let primaryAccountInfo = $state<LegacyAccount | null>(null);
	let childAccounts = $state<LegacyAccount[]>([]);
	let loadState = $state<DataState>('loading');
	let refreshFailed = $state(false);
	let now = $state(Date.now());
	let showNode = $state(untrack(() => tabs.hash.toLowerCase() === '#consensus'));
	$effect(() => {
		if (tabs.hash.toLowerCase() === '#consensus') showNode = true;
	});
	let sequence = 0;
	let loadedAddress = '';
	const viewContracts = $derived(
		snapshot?.contracts.filter((contract) => !parentWalletId || contract.address === walletId) ?? []
	);
	const viewOwner = $derived(parentWalletId ? null : (snapshot?.owner ?? null));
	const viewAccount = $derived(viewOwner ?? viewContracts[0] ?? null);
	const dataState = $derived(
		loadState === 'ready' && snapshot && now - Date.parse(snapshot.asOf) > 300000
			? 'stale'
			: loadState
	);
	const summary = $derived(
		summarizeWallet({
			owner: viewOwner,
			contracts: viewContracts,
			contractsState: snapshot?.contractsState ?? 'loading',
			current: snapshot?.current ?? null,
			history: snapshot?.history ?? [],
			state: dataState,
			now,
			tokens: snapshot?.tokens,
			price: snapshot?.price
		})
	);
	const connected = $derived(canSignFor($selectedWallet, walletId));
	const avatar = $derived.by(() => {
		const hash = Array.from(walletId).reduce(
			(value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
			0
		);
		return `linear-gradient(135deg, hsl(${20 + (hash % 311)} 75% 72%), hsl(${20 + ((hash + 90) % 311)} 75% 58%))`;
	});

	// Only a user pick navigates. Restore and store notifications never call this handler (TASK-132).
	function handleAccountPicked(pick: ConnectedAccount) {
		const target = pickNavigation({
			pick,
			routeAddress: walletId,
			parentAddress: parentWalletId,
			pinned: get(pinnedFlows) > 0
		});
		if (target) goto(target, { invalidateAll: true });
	}

	const updateAccountInfo = async (address: string, force = false) => {
		if (!browser || !walletId) return;
		const requestedAddress = walletId;
		const request = ++sequence;
		if (loadedAddress !== requestedAddress) {
			snapshot = null;
			primaryAccountInfo = null;
			childAccounts = [];
		}
		loadState = 'loading';
		refreshFailed = false;
		try {
			const result = await loadWallet(address, requestedAddress, force);
			if (request !== sequence) return;
			snapshot = result;
			primaryAccountInfo = result.primary;
			childAccounts = result.children;
			loadedAddress = requestedAddress;
			loadState = 'ready';
			now = Date.now();
		} catch (error) {
			if (request !== sequence) return;
			console.error('Error updating account info:', error);
			loadState = snapshot ? 'stale' : 'error';
			refreshFailed = snapshot !== null;
		}
	};
	createWalletRouteSync(
		() => walletId,
		() => parentWalletId,
		updateAccountInfo
	);
	onMount(() => {
		const timer = setInterval(() => {
			now = Date.now();
		}, 30000);
		return () => clearInterval(timer);
	});
	onDestroy(() => {
		sequence++;
	});
	function refresh() {
		if (browser && walletId) return updateAccountInfo(parentWalletId || walletId, true);
	}
</script>

<svelte:head
	><title>{walletId ? `${shortAddr(walletId)} · Wallet` : 'Wallet'} · Voi Rewards</title
	></svelte:head
>

<div class="min-w-0">
	<div class="on-hero rounded-b-hero bg-hero pb-[70px] pt-8 text-on-hero md:pb-[84px]">
		<div class="container-page min-w-0 space-y-5">
			<div class="flex min-w-0 flex-wrap items-start justify-between gap-5">
				<div class="flex min-w-0 flex-1 flex-wrap items-center gap-4">
					<div
						aria-hidden="true"
						class="h-16 w-16 shrink-0 rounded-ds-md"
						style:background={avatar}
					></div>
					<div class="min-w-0 flex-1">
						<h1 class="break-words text-title">
							{walletId ? shortAddr(walletId) : 'Check a wallet'}
						</h1>
						{#if walletId}<div
								class="mt-2 flex min-w-0 items-center gap-2 text-label text-on-hero-muted"
							>
								<span class="min-w-0 break-all">{walletId}</span><CopyButton
									onHero
									text={walletId}
									what="wallet address"
								/>
							</div>{/if}
					</div>
				</div>
				<div class="wallet-picker relative ml-auto max-w-full">
					<Web3Wallet
						enabledWallets={['walletconnect', 'kibisis', 'lute', 'biatec', 'voiwallet']}
						{algodClient}
						indexerClient={algodIndexer}
						wcConfig={{
							projectId: wcProjectId,
							name: 'Voi Rewards Auditor',
							description: 'Voi Rewards Auditor',
							url: 'https://voirewards.com',
							icons: ['https://voirewards.com/android-chrome-192x192.png']
						}}
						class="bg-surface-2 text-ink"
						allowWatchAccounts={true}
						showSignInStatus={false}
						displayMode="dropdown"
						onAccountPicked={handleAccountPicked}
					/>
				</div>
			</div>
			{#if walletId}
				<div class="flex flex-wrap gap-2">
					<StatusPill
						onHero
						tone={viewAccount?.isParticipating ? 'ok' : viewAccount ? 'neutral' : 'info'}
						label={viewAccount
							? `${parentWalletId ? 'Contract' : 'Owner'} · ${viewAccount.isParticipating ? 'online' : 'offline'}`
							: 'Loading account status'}
					/>
					{#if snapshot}<StatusPill
							onHero
							tone="info"
							label={snapshot.contractsState === 'error'
								? 'Lock contracts unavailable'
								: `${viewContracts.length} lock ${viewContracts.length === 1 ? 'contract' : 'contracts'}`}
						/>{/if}
					<StatusPill
						onHero
						tone={connected ? 'ok' : 'neutral'}
						label={connected ? 'Connected' : 'Watch only'}
					/>
				</div>
				<Headline account={{ addr: walletId }} {summary} onretry={refresh} />
				{#if parentWalletId}<a
						class="inline-block text-label text-on-hero-muted underline"
						href={`/wallet/${parentWalletId}`}
						>View owner {shortAddr(parentWalletId)} and all contracts →</a
					>{/if}
			{:else}
				<SearchBox
					variant="compact"
					onsubmit={(address) => goto(`/wallet/${address}`, { invalidateAll: true })}
				/>
			{/if}
			<Tabs variant="nav" items={sections} current={tabs.current} label="Wallet sections" />
		</div>
	</div>
	<div
		bind:this={panel}
		tabindex="-1"
		role="region"
		class="container-page relative -mt-[60px] min-w-0 pb-8"
		aria-label="Wallet section"
	>
		{#if walletId}
			{#if tabs.current === 'overview'}
				<WalletOverview
					{summary}
					contracts={viewContracts}
					current={snapshot?.current ?? null}
					historyState={snapshot?.historyState ?? 'loading'}
					price={snapshot?.price ?? null}
					pageAddress={walletId}
					selected={$selectedWallet}
					asOf={snapshot?.asOf}
					{now}
					onrefresh={refresh}
				/>
				<details
					bind:open={showNode}
					class="mt-bento rounded-card border border-line bg-surface p-card"
				>
					<summary class="cursor-pointer font-bold text-accent">Consensus details</summary>
					{#if showNode}<div class="legacy-panel mt-4">
							<NodeComponent
								{walletId}
								parentWalletId={parentWalletId ?? null}
								contractId={childAccounts.find((account) => account.address === walletId)
									?.contractId ?? null}
							/>
						</div>{/if}
				</details>
			{:else if tabs.current === 'holdings'}
				<div class="legacy-panel">
					<PortfolioComponent
						walletAddress={walletId}
						parentWalletAddress={parentWalletId ?? null}
					/>
				</div>
			{:else if tabs.current === 'rewards'}
				<div class="legacy-panel space-y-6">
					<EpochComponent walletAddress={walletId} /><ProposalsComponent {walletId} />
				</div>
			{:else if tabs.current === 'contracts'}
				{#if snapshot?.contractsState === 'error'}
					<InlineAlert message="Lock contracts unavailable." onretry={refresh} />
				{:else}<div class="legacy-panel"><LockVestComponent {childAccounts} /></div>{/if}
			{:else if tabs.current === 'calculator'}
				<Card title="Calculator"
					><div class="legacy-panel">
						<CalculatorComponent walletAddress={walletId} {childAccounts} {primaryAccountInfo} />
					</div></Card
				>
			{/if}
			<div class="mt-5 flex flex-wrap items-center justify-between gap-3 text-label text-ink-muted">
				<p>
					{#if snapshot}Block {comma(snapshot.owner.round)} · data as of
						<time datetime={snapshot.asOf}>{new Date(snapshot.asOf).toUTCString()}</time
						>{:else}Wallet data loads in your browser.{/if}
				</p>
				<Button variant="soft" size="sm" onclick={refresh} disabled={loadState === 'loading'}
					>Refresh wallet data</Button
				>
			</div>
			{#if dataState === 'stale'}<div class="mt-3">
					<InlineAlert
						tone="warn"
						message={refreshFailed
							? 'Refresh failed; showing the last loaded wallet data.'
							: 'Wallet data is more than five minutes old.'}
						onretry={refresh}
					/>
				</div>{/if}
		{:else if tabs.current === 'calculator'}
			<Card title="Calculator"><div class="legacy-panel"><CalculatorComponent /></div></Card>
		{:else}
			<Card title="Wallet overview"
				><p class="text-ink-muted">
					Connect a wallet or search for an address to view account information.
				</p></Card
			>
		{/if}
	</div>
</div>

<style>
	.wallet-picker :global(.avm-wallet__dropdown) {
		left: auto;
		right: 0;
		min-width: 0;
		width: min(360px, calc(100vw - 32px));
		max-width: calc(100vw - 32px);
	}
	/* Legacy panels retain their own layouts until W3/W4; contain their wide content locally. */
	.legacy-panel {
		min-width: 0;
		max-width: 100%;
		overflow-x: auto;
	}
</style>
