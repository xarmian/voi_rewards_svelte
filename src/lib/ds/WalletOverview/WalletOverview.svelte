<script lang="ts">
	import type { WalletSummary, WalletContract } from '$lib/wallet/summary';
	import type { WalletEpoch } from '$lib/epochRewards';
	import { walletEpochView } from '$lib/epochRewards/client';
	import { WalletEpochCard, WalletEpochChart } from '$lib/epochRewards/components';
	import type { PageAccountState } from '$lib/chain/signerGate';
	import type { DataState } from '../types';
	import Card from '../Card/Card.svelte';
	import HealthRing from '../HealthRing/HealthRing.svelte';
	import HealthItem from '../HealthItem/HealthItem.svelte';
	import StatusPill from '../StatusPill/StatusPill.svelte';
	import BlockRewardStatusPill from '../BlockRewardStatusPill/BlockRewardStatusPill.svelte';
	import Button from '../Button/Button.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import Chip from '../Chip/Chip.svelte';
	import WalletContracts from '../WalletContracts/WalletContracts.svelte';
	import WalletBlockRewards from '../WalletBlockRewards/WalletBlockRewards.svelte';
	import { ago, comma, compact, usd } from '../format';
	import { retryKeepingFocus } from '../retryFocus';

	let {
		summary,
		contracts,
		current,
		historyState = 'loading',
		price = null,
		pageAddress,
		isContract = false,
		contractId = null,
		accountState,
		asOf,
		now,
		onrefresh
	}: {
		summary: WalletSummary;
		contracts: WalletContract[];
		current: WalletEpoch | null;
		historyState?: DataState;
		price?: number | null;
		pageAddress: string;
		/** Whether the page address is a staking contract. */
		isContract?: boolean;
		/** The page contract's application id, when the page is a staking contract. */
		contractId?: number | null;
		accountState: PageAccountState<{ address: string; app: string; walletId?: string }>;
		asOf?: string;
		now: number;
		onrefresh?: () => Promise<void> | void;
	} = $props();
	const loading = $derived(summary.state === 'loading');
	const failed = $derived(summary.state === 'error');
	const stakingUnavailable = $derived(summary.contractSet === 'unavailable');
	// The epoch card and chart, or null when epoch rewards are off.
	const epoch = $derived(walletEpochView(summary));
	// A refresh swaps each card's alert for its loading state; these stable regions keep focus in the card.
	let healthRegion: HTMLDivElement | undefined = $state();
	let holdingsRegion: HTMLDivElement | undefined = $state();
	let unlocksRegion: HTMLDivElement | undefined = $state();
	const date = (value: string | number) =>
		new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(value));
	const maxYear = $derived(Math.max(1, ...summary.lockedByYear.map((year) => year.amount)));
	const heartbeat = $derived(summary.heartbeat);
	const plural = (count: number, word: string) =>
		`${comma(count)} ${word}${count === 1 ? '' : 's'}`;
	/** "Last proposed 10m ago" from an age in seconds; ages are at the fallback block time. */
	function seen(label: string, missing: string, seconds: number | null) {
		return seconds === null ? missing : `${label} ${ago(now - seconds * 1000, now)}`;
	}
	const heartbeatAges = $derived(
		heartbeat.shown
			? `${seen('Last proposed', 'No proposal on record', heartbeat.shown.lastProposedSeconds)} · ${seen('last heartbeat', 'no heartbeat on record', heartbeat.shown.lastHeartbeatSeconds)}`
			: null
	);
	const heartbeatDetail = $derived(
		[
			heartbeat.overdueCount > 0
				? `${heartbeatAges} · ${plural(heartbeat.overdueCount, 'online account')} silent longer than expected. The node may be suspended soon if it stays silent.`
				: heartbeat.shown && heartbeat.tone === 'neutral'
					? 'Online stake unavailable, so staleness is not checked.'
					: heartbeat.shown
						? 'Longest silence among online accounts'
						: heartbeat.unknownCount > 0
							? 'No proposal or heartbeat on record for online accounts.'
							: 'No online accounts.',
			heartbeat.shown && heartbeat.unknownCount > 0
				? `${comma(heartbeat.unknownCount)} with no proposal or heartbeat on record`
				: ''
		]
			.filter(Boolean)
			.join(' · ')
	);
	// The owner's 2 VOI re-registration opens the same key registration as the legacy node panel.
	let RegisterVoteKey: typeof import('$lib/component/RegisterVoteKey.svelte').default | null =
		$state(null);
	let showRegisterVoteKey = $state(false);
	let registerError = $state('');
	async function makeEligible() {
		registerError = '';
		try {
			RegisterVoteKey ??= (await import('$lib/component/RegisterVoteKey.svelte')).default;
			if (accountState.state === 'yours') showRegisterVoteKey = true;
		} catch {
			registerError = 'Unable to open this action. Please try again.';
		}
	}
	async function handleVoteKeySuccess(forceRefresh = false) {
		if (forceRefresh) await onrefresh?.();
	}
	const holdings = $derived(summary.holdings);
	const parts = $derived([
		{ label: 'Locked', value: holdings.locked, color: 'bg-accent-fill' },
		{ label: 'LP', value: holdings.lp, color: 'bg-hi' },
		{ label: 'Tokens and other', value: holdings.other, color: 'bg-series-3' },
		{ label: 'Liquid', value: holdings.liquid, color: 'bg-ink-muted' }
	]);
</script>

{#snippet skeleton(label: string)}
	<div class="space-y-3 py-3" aria-busy="true">
		<span class="sr-only">Loading {label}…</span>
		<div aria-hidden="true" class="h-10 rounded-ds-xs bg-grid"></div>
		<div aria-hidden="true" class="h-6 w-3/4 rounded-ds-xs bg-grid"></div>
		<div aria-hidden="true" class="h-6 w-1/2 rounded-ds-xs bg-grid"></div>
	</div>
{/snippet}
{#snippet healthStatus()}
	{#if !loading && !failed && stakingUnavailable}<StatusPill tone="neutral" label="Unavailable" />
	{:else if !loading && !failed}<StatusPill
			tone={summary.healthTone}
			label={summary.onlineAccounts === 0
				? 'Offline'
				: summary.healthTone === 'ok'
					? 'All online accounts OK'
					: 'Needs attention'}
		/>{/if}
{/snippet}

<div class="grid min-w-0 grid-cols-1 gap-bento md:grid-cols-2 lg:grid-cols-12">
	<Card title="Node health" span={{ lg: epoch ? 5 : 8 }} actions={healthStatus}>
		<div bind:this={healthRegion} tabindex="-1" class="focus:outline-none">
			{#if !loading && (failed || stakingUnavailable)}<InlineAlert
					message="Node health unavailable."
					onretry={retryKeepingFocus(() => healthRegion, onrefresh)}
				/>
			{:else}
				<div class="flex flex-wrap items-center gap-5">
					<HealthRing
						value={summary.onlineContracts}
						total={summary.healthContractCount}
						tone={summary.healthTone}
						state={loading ? 'loading' : 'ready'}
					/>
					{#if loading}<div class="min-w-0 flex-1">{@render skeleton('node health')}</div>
					{:else}
						<ul aria-label="Node health checks" class="min-w-0 flex-1 space-y-4">
							<HealthItem
								tone={summary.keyTone}
								title={summary.keyDays === null
									? 'Key expiry unavailable'
									: summary.keyDays <= 0
										? 'Key expired'
										: `Keys valid ${comma(Math.ceil(summary.keyDays))} days`}
								detail={summary.keyDays === null
									? 'No participation key information available.'
									: `Estimated expiry ${date(now + summary.keyDays * 86400000)}`}
							/>
							<HealthItem
								tone={heartbeat.tone}
								title={!heartbeatAges
									? 'Heartbeat unavailable'
									: heartbeat.overdueCount > 0
										? 'Heartbeat overdue'
										: heartbeatAges}
								detail={heartbeatDetail}
							/>
							{#if summary.suspendedCount > 0}<HealthItem
									tone="danger"
									title={`${plural(summary.suspendedCount, 'account')} suspended`}
									detail="Taken offline for missing proposals. Register keys again to come back online."
								/>{/if}
							<HealthItem
								tone={summary.idleCount ? 'warn' : 'ok'}
								title={`${comma(summary.idleCount)} ${summary.idleCount === 1 ? 'contract' : 'contracts'} not staking`}
								detail={`${compact(summary.idleBalance, 1)} VOI idle${summary.idleCount && accountState.state === 'yours' ? ' · register a key in Contracts to earn' : ''}${summary.emptyContracts > 0 ? ` · ${comma(summary.emptyContracts)} empty ${summary.emptyContracts === 1 ? 'contract' : 'contracts'} not shown` : ''}`}
							/>
						</ul>
					{/if}
				</div>
				{#if !loading && summary.eligibilityRows.length}
					<h3 class="mt-5 text-label font-bold text-ink-muted">Real-time block rewards</h3>
					<ul aria-label="Real-time block reward eligibility" class="mt-2 divide-y divide-line">
						{#each summary.eligibilityRows as row (row.address)}
							<li class="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2">
								<span class="text-sm font-bold"
									>{row.contractId === null ? 'This account' : `Contract #${row.contractId}`}</span
								>
								<div class="flex min-w-0 flex-col items-end gap-1">
									{#if row.eligibility}<BlockRewardStatusPill
											status={row.eligibility.status}
											compact
										/>{:else}<StatusPill tone="neutral" label="Unavailable" />{/if}
									{#if row.contractId === null && row.address === pageAddress && accountState.state === 'yours' && row.eligibility?.canMakeEligible}<Button
											variant="soft"
											size="sm"
											onclick={makeEligible}>Make eligible (2 VOI)</Button
										>{/if}
								</div>
							</li>
						{/each}
					</ul>
					{#if registerError}<InlineAlert message={registerError} />{/if}
				{/if}
			{/if}
		</div>
	</Card>
	{#if epoch}<WalletEpochCard summary={epoch} {current} {historyState} {price} {onrefresh} />
		<WalletEpochChart summary={epoch} {historyState} {asOf} {onrefresh} />{/if}
	<Card title="Holdings" span={{ lg: 4 }}>
		<div bind:this={holdingsRegion} tabindex="-1" class="focus:outline-none">
			{#if loading}{@render skeleton('holdings')}
			{:else if failed || holdings.state === 'error'}<InlineAlert
					message={summary.contractsReady
						? 'Holdings valuation unavailable.'
						: 'Holdings valuation unavailable. Locked balance unavailable.'}
					onretry={retryKeepingFocus(
						() => holdingsRegion,
						failed || stakingUnavailable || summary.contractsReady ? onrefresh : undefined
					)}
				/>
				{#if !failed && holdings.liquidKnown}<p class="mt-3 text-label">
						Liquid: <strong>{comma(holdings.liquid)} VOI</strong>
					</p>{:else if !failed && summary.ownerLookup === 'unavailable'}<p class="mt-3 text-label">
						Liquid: <strong>Unavailable</strong>
					</p>{/if}
			{:else}
				<p>
					<strong class="text-stat" title={`${holdings.total} VOI`}
						>{compact(holdings.total)}</strong
					>
					<span class="text-label text-ink-muted"
						>VOI · {holdings.usd === null ? 'USD unavailable' : usd(holdings.usd)}</span
					>
				</p>
				<div aria-hidden="true" class="my-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-grid">
					{#each parts as part (part.label)}<div
							class={part.color}
							style:width={`${holdings.total ? (part.value / holdings.total) * 100 : 0}%`}
						></div>{/each}
				</div>
				<dl class="grid grid-cols-2 gap-4">
					{#each parts as part (part.label)}<div>
							<dt class="flex items-center gap-2 text-label text-ink-muted">
								<span aria-hidden="true" class={`h-2 w-2 shrink-0 rounded-sm ${part.color}`}
								></span>{part.label}
							</dt>
							<dd class="text-h2" title={`${part.value} VOI`}>{compact(part.value)}</dd>
						</div>{/each}
				</dl>
				<p class="mt-4">
					<Chip label={`${holdings.lpCount} LP positions · ${holdings.tokenCount} tokens`} />
				</p>
				<p class="mt-4 text-label text-ink-muted">
					Tokens and other includes unlocked VOI in contracts. Values use the existing portfolio
					pricing service.
				</p>
			{/if}
			<a href="#holdings" class="mt-4 inline-block font-bold text-accent underline"
				>View holdings →</a
			>
		</div>
	</Card>
	<div class="min-w-0 lg:col-span-8">
		<WalletContracts
			{contracts}
			{current}
			{pageAddress}
			{accountState}
			state={loading ? 'loading' : stakingUnavailable ? 'error' : summary.state}
			{asOf}
			{onrefresh}
		/>
	</div>
	<Card title="Next unlocks" span={{ lg: 4 }}>
		<div bind:this={unlocksRegion} tabindex="-1" class="focus:outline-none">
			{#if loading}{@render skeleton('next unlocks')}
			{:else if failed || !summary.contractsReady}<InlineAlert
					message="Unlock schedules unavailable."
					onretry={retryKeepingFocus(
						() => unlocksRegion,
						failed || stakingUnavailable ? onrefresh : undefined
					)}
				/>
			{:else}
				{#if summary.unlocks.length}
					<ol class="space-y-3">
						{#each summary.unlocks as unlock (unlock.date)}
							<li
								class="flex flex-wrap items-center justify-between gap-2 rounded-ds-sm border border-line bg-surface-2 p-3"
							>
								<div>
									<time class="font-bold" datetime={unlock.date}>{date(unlock.date)}</time>
									<p class="text-label text-ink-muted">
										{unlock.count}
										{unlock.count === 1 ? 'contract' : 'contracts'}
									</p>
								</div>
								<strong class="text-accent">+{compact(unlock.amount, 1)} VOI</strong>
							</li>
						{/each}
					</ol>
				{:else}<p class="text-sm text-ink-muted">No upcoming unlocks.</p>{/if}
				<div class="mt-4 space-y-3">
					{#each summary.lockedByYear as year (year.year)}
						<div>
							<dl class="flex flex-wrap justify-between gap-2 text-label">
								<dt>Locked · vesting-start year {year.year}</dt>
								<dd>{compact(year.amount)} VOI</dd>
							</dl>
							<div aria-hidden="true" class="mt-1 h-2 rounded-full bg-grid">
								<div
									class="h-full rounded-full bg-bar"
									style:width={`${(year.amount / maxYear) * 100}%`}
								></div>
							</div>
						</div>
					{/each}
				</div>
				<p class="mt-4 text-label">
					Withdrawable now: <strong>{compact(summary.withdrawable, 1)} VOI</strong>
				</p>
			{/if}
		</div>
	</Card>
	<WalletBlockRewards
		{pageAddress}
		{isContract}
		{contractId}
		ownerLookup={summary.ownerLookup === 'unavailable' ? 'unavailable' : 'ok'}
		onretrylookup={onrefresh}
	/>
</div>
{#if showRegisterVoteKey && RegisterVoteKey}
	<!-- The on-chain offer exists only for an online account, so the account is online here. -->
	<RegisterVoteKey
		{pageAddress}
		walletAddress={pageAddress}
		parentWalletAddress={null}
		contractId={null}
		isOnline={true}
		bind:showModal={showRegisterVoteKey}
		onSuccess={handleVoteKeySuccess}
	/>
{/if}
