<script lang="ts">
	import { Web3Wallet, type ConnectedAccount } from 'avm-wallet-svelte';
	import { connectedWallets } from '$lib/chain/wallet.svelte';
	import { get } from 'svelte/store';
	import { pinnedFlows } from '$lib/chain/flowAccount';
	import { pickNavigation } from '$lib/utils/walletSelection';
	import { pageAccountState } from '$lib/chain/signerGate';
	import { algodClient, algodIndexer } from '$lib/utils/algod';
	import { PUBLIC_WALLETCONNECT_PROJECT_ID as wcProjectId } from '$env/static/public';
	import { goto, invalidate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onDestroy, onMount, untrack } from 'svelte';
	import {
		Button,
		Card,
		CopyButton,
		Headline,
		InlineAlert,
		WalletSearchPage,
		WalletRewards,
		StatusPill,
		Tabs,
		WalletOverview,
		WalletContractsPanel,
		WalletAvatar,
		createHashTabs,
		shortAddr,
		comma
	} from '$lib/ds';
	import { WALLET_TABS } from '$lib/ds/Tabs/hash';
	import type { DataState } from '$lib/ds';
	import { createWalletRouteSync } from '$lib/wallet/routeSync.svelte';
	import { createWalletIdentity } from '$lib/wallet/identity.svelte';
	import { summarizeWallet } from '$lib/wallet/summary';
	import { loadWallet, type LegacyAccount, type WalletSnapshot } from '$lib/wallet/load';
	import { loadContracts, type ContractsSnapshot } from '$lib/wallet/contracts';
	import NodeComponent from '$lib/component/NodeComponent.svelte';
	import CalculatorComponent from '$lib/component/CalculatorComponent.svelte';
	import PortfolioComponent from '$lib/component/PortfolioComponent.svelte';

	let {
		data
	}: {
		data: {
			walletId: string | null;
			parentWalletId: string | null;
			ownerLookup?: 'ok' | 'unavailable';
			hash?: string;
		};
	} = $props();
	const walletId = $derived(data.walletId ?? '');
	const identity = createWalletIdentity(() => walletId);
	const parentWalletId = $derived(data.parentWalletId);
	const ownerLookup = $derived(data.ownerLookup ?? 'ok');
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
		void tabs.revision;
		if (tabs.hash.toLowerCase() === '#consensus') showNode = true;
	});
	let sequence = 0;
	let loadedAddress = $state('');
	let loadedOwner = $state('');
	const snapshotMatches = $derived(
		loadedAddress === walletId && loadedOwner === (parentWalletId || walletId)
	);
	const knownContractSet = $derived(
		ownerLookup === 'ok' && snapshotMatches
			? (snapshot?.contractSet ?? 'unavailable')
			: 'unavailable'
	);
	let contractsSnapshot = $state.raw<ContractsSnapshot | null>(null);
	let contractsLoadState = $state<DataState>('loading');
	let contractsRefreshFailed = $state(false);
	let contractsLoadedAddress = $state('');
	let contractsLoadedOwner = $state('');
	let contractsSequence = 0;
	const contractsMatch = $derived(
		contractsLoadedAddress === walletId && contractsLoadedOwner === (parentWalletId || walletId)
	);
	const viewContracts = $derived(
		snapshotMatches
			? (snapshot?.contracts.filter(
					(contract) => !parentWalletId || contract.address === walletId
				) ?? [])
			: []
	);
	const viewOwner = $derived(
		parentWalletId || !snapshotMatches || ownerLookup !== 'ok' ? null : (snapshot?.owner ?? null)
	);
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
			contractSet: knownContractSet,
			ownerLookup,
			current: snapshot?.current ?? null,
			history: snapshot?.history ?? [],
			state: dataState,
			now,
			tokens: snapshot?.tokens,
			price: snapshot?.price
		})
	);
	const accountState = $derived(pageAccountState(walletId, $connectedWallets));
	const yours = $derived(accountState.state === 'yours');
	const ownerState = $derived(pageAccountState(parentWalletId, $connectedWallets));
	const avatar = $derived.by(() => {
		const hash = Array.from(walletId).reduce(
			(value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
			0
		);
		return `linear-gradient(135deg, hsl(${20 + (hash % 311)} 75% 72%), hsl(${20 + ((hash + 90) % 311)} 75% 58%))`;
	});

	function searchWallet(address: string) {
		void goto(`/wallet/${address}`, { invalidateAll: true });
	}
	// Only a user pick navigates. Restore and store notifications never call this handler (TASK-132).
	function handleAccountPicked(pick: ConnectedAccount) {
		const target = pickNavigation({
			pick,
			routeAddress: walletId,
			pinned: get(pinnedFlows) > 0
		});
		if (target) goto(target, { invalidateAll: true });
	}

	const updateAccountInfo = async (address: string, force = false) => {
		if (!browser || !walletId) return;
		const requestedAddress = walletId;
		const request = ++sequence;
		if (loadedAddress !== requestedAddress || loadedOwner !== address) {
			snapshot = null;
			primaryAccountInfo = null;
			childAccounts = [];
		}
		loadState = 'loading';
		refreshFailed = false;
		try {
			const result = await loadWallet(address, requestedAddress, force);
			if (
				request !== sequence ||
				walletId !== requestedAddress ||
				(parentWalletId || walletId) !== address
			)
				return;
			snapshot = result;
			primaryAccountInfo = result.primary;
			childAccounts = result.children;
			loadedAddress = requestedAddress;
			loadedOwner = address;
			loadState = 'ready';
			now = Date.now();
		} catch (error) {
			if (
				request !== sequence ||
				walletId !== requestedAddress ||
				(parentWalletId || walletId) !== address
			)
				return;
			console.error('Error updating account info:', error);
			loadState = snapshot ? 'stale' : 'error';
			refreshFailed = snapshot !== null;
		}
	};
	async function updateContracts(force = false) {
		if (!browser || !walletId) return;
		const requestedAddress = walletId;
		const requestedOwner = parentWalletId || walletId;
		const request = ++contractsSequence;
		if (contractsLoadedAddress !== requestedAddress || contractsLoadedOwner !== requestedOwner) {
			contractsSnapshot = null;
		}
		contractsLoadState = 'loading';
		contractsRefreshFailed = false;
		try {
			const result = await loadContracts(requestedOwner, requestedAddress, force);
			if (
				request !== contractsSequence ||
				walletId !== requestedAddress ||
				(parentWalletId || walletId) !== requestedOwner
			)
				return;
			contractsLoadedAddress = requestedAddress;
			contractsLoadedOwner = requestedOwner;
			// A failed list remains unknown even when old rows are retained for display.
			if (result.contractSet === 'unavailable') {
				contractsSnapshot = contractsSnapshot
					? { ...contractsSnapshot, contractSet: 'unavailable' }
					: result;
				contractsRefreshFailed = true;
				contractsLoadState = contractsSnapshot.contracts.length > 0 ? 'stale' : 'error';
				return;
			}
			contractsSnapshot = result;
			contractsLoadedAddress = requestedAddress;
			contractsLoadedOwner = requestedOwner;
			contractsLoadState = 'ready';
		} catch (error) {
			if (
				request !== contractsSequence ||
				walletId !== requestedAddress ||
				(parentWalletId || walletId) !== requestedOwner
			)
				return;
			contractsLoadedAddress = requestedAddress;
			contractsLoadedOwner = requestedOwner;
			console.error('Error updating contracts:', error);
			// Retained rows stay visible, but a failed refresh leaves their source unknown: no actions.
			if (contractsSnapshot)
				contractsSnapshot = { ...contractsSnapshot, contractSet: 'unavailable' };
			contractsLoadState = contractsSnapshot ? 'stale' : 'error';
			contractsRefreshFailed = contractsSnapshot !== null;
		}
	}
	$effect(() => {
		void walletId;
		void parentWalletId;
		if (tabs.current === 'contracts')
			untrack(() => {
				void updateContracts();
			});
	});
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
		contractsSequence++;
	});
	function refresh() {
		if (!browser || !walletId) return;
		if (ownerLookup === 'unavailable') return invalidate('wallet:id');
		// Overview data is reloaded too, so a completed withdrawal is not shown stale there.
		if (tabs.current === 'contracts')
			return Promise.all([
				updateContracts(true),
				updateAccountInfo(parentWalletId || walletId, true)
			]).then(() => undefined);
		return updateAccountInfo(parentWalletId || walletId, true);
	}
</script>

<svelte:head
	><title>{walletId ? `${shortAddr(walletId)} · Wallet` : 'Wallet'} · Voi Rewards</title
	></svelte:head
>

<div class="min-w-0">
	<div
		class={walletId
			? 'on-hero rounded-b-hero bg-hero pb-[70px] pt-8 text-on-hero md:pb-[84px]'
			: 'on-hero bg-hero pt-6 text-on-hero'}
	>
		<div class="container-page min-w-0 space-y-5">
			<div class="flex min-w-0 flex-wrap items-start justify-between gap-5">
				{#if walletId}<div class="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-4">
						<WalletAvatar gradient={avatar} src={identity.avatar} />
						<div class="min-w-0 flex-1 basis-40">
							<h1 class="break-words text-title">
								{walletId ? (identity.name ?? shortAddr(walletId)) : 'Check a wallet'}
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
					</div>{/if}
				<div class="wallet-picker relative ml-auto max-w-full">
					<Web3Wallet
						accountMode="navigation"
						currentAccount={accountState.state === 'yours' ? accountState.signingEntry : null}
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
					>
						{#snippet trigger({ toggle })}
							<button
								type="button"
								onclick={toggle}
								class="rounded-ds-sm bg-surface-2 px-4 py-2 text-ink"
								aria-label={$connectedWallets.length ? 'Your accounts' : 'Connect wallet'}
							>
								{$connectedWallets.length
									? accountState.state === 'yours'
										? (accountState.signingEntry.name ?? shortAddr(walletId))
										: 'Your accounts'
									: 'Connect wallet'}
							</button>
						{/snippet}
					</Web3Wallet>
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
							label={snapshot.contractSet === 'unavailable'
								? 'Lock contracts unavailable'
								: `${viewContracts.length} lock ${viewContracts.length === 1 ? 'contract' : 'contracts'}`}
						/>{/if}
					<StatusPill
						onHero
						tone={yours ? 'ok' : 'neutral'}
						label={yours
							? 'Your account'
							: accountState.state === 'watch-only'
								? 'Watch only'
								: 'Read-only'}
					/>
				</div>
				<Headline {yours} account={{ addr: walletId }} {summary} onretry={refresh} />
				{#if !yours}
					<p class="text-label text-on-hero-muted">
						{accountState.state === 'watch-only'
							? 'Read-only. This account is connected for watching only.'
							: $connectedWallets.length
								? "Read-only. This isn't one of your connected accounts."
								: 'Read-only. Connect a wallet to act on your own accounts.'}
					</p>
				{/if}
				{#if parentWalletId}
					{#if ownerState.state === 'yours'}
						<p class="text-label text-on-hero-muted">
							This contract belongs to your account <a
								class="underline"
								href={`/wallet/${parentWalletId}`}
								>{ownerState.signingEntry.name ?? shortAddr(parentWalletId)}</a
							>. Manage it from your account page.
						</p>
					{:else}<a
							class="inline-block text-label text-on-hero-muted underline"
							href={`/wallet/${parentWalletId}`}
							>View owner {shortAddr(parentWalletId)} and all contracts →</a
						>{/if}
				{/if}
			{/if}
			{#if walletId}<Tabs
					variant="nav"
					items={sections}
					current={tabs.current}
					label="Wallet sections"
				/>{/if}
		</div>
	</div>
	{#if !walletId}<WalletSearchPage onsubmit={searchWallet} />{/if}
	<div
		hidden={!walletId}
		bind:this={panel}
		tabindex="-1"
		role="region"
		class="container-page relative -mt-[60px] min-w-0 pb-8"
		aria-label="Wallet section"
	>
		{#if walletId}{#key walletId}
				{#if tabs.current === 'overview'}
					<WalletOverview
						{summary}
						contracts={viewContracts}
						current={snapshot?.current ?? null}
						historyState={snapshot?.historyState ?? 'loading'}
						price={snapshot?.price ?? null}
						pageAddress={walletId}
						{accountState}
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
					<div class="min-w-0">
						<PortfolioComponent
							walletAddress={walletId}
							parentWalletAddress={parentWalletId ?? null}
							holdingsSplit={snapshot
								? {
										pageAddress: loadedAddress,
										owner: viewOwner,
										contracts: viewContracts,
										contractSet: knownContractSet,
										ownerAddress: loadedOwner,
										ownerLookup
									}
								: undefined}
						/>
					</div>
				{:else if tabs.current === 'rewards'}
					<WalletRewards pageAddress={walletId} />
				{:else if tabs.current === 'contracts'}
					<WalletContractsPanel
						contracts={contractsMatch ? (contractsSnapshot?.contracts ?? []) : []}
						current={snapshotMatches ? (snapshot?.current ?? null) : null}
						pageAddress={walletId}
						{accountState}
						state={contractsMatch ? contractsLoadState : 'loading'}
						contractSet={ownerLookup === 'ok' ? contractsSnapshot?.contractSet : 'unavailable'}
						asOf={contractsSnapshot?.asOf}
						{now}
						onrefresh={ownerLookup === 'unavailable' ? refresh : () => updateContracts(true)}
					/>
					{#if contractsRefreshFailed && contractsLoadState === 'stale'}<div class="mt-3">
							<InlineAlert
								tone="warn"
								message="Refresh failed; showing the last loaded contracts."
								onretry={ownerLookup === 'unavailable' ? refresh : () => updateContracts(true)}
							/>
						</div>{/if}
				{:else if tabs.current === 'calculator'}
					<Card title="Calculator"
						><CalculatorComponent
							walletAddress={walletId}
							{childAccounts}
							{primaryAccountInfo}
						/></Card
					>
				{/if}
				<div
					class="mt-5 flex flex-wrap items-center justify-between gap-3 text-label text-ink-muted"
				>
					<p>
						{#if snapshot}Block {comma(snapshot.owner.round)} · data as of
							<time datetime={snapshot.asOf}>{new Date(snapshot.asOf).toUTCString()}</time
							>{:else}Wallet data loads in your browser.{/if}
					</p>
					<Button
						variant="soft"
						size="sm"
						onclick={refresh}
						disabled={tabs.current === 'contracts'
							? contractsLoadState === 'loading'
							: loadState === 'loading'}>Refresh wallet data</Button
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
			{/key}{/if}
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
