<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Card from '../Card/Card.svelte';
	import Button from '../Button/Button.svelte';
	import StatusPill from '../StatusPill/StatusPill.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import StatTile from '../StatTile/StatTile.svelte';
	import BlockRewardsPausedAlert from '../BlockRewardsPausedAlert/BlockRewardsPausedAlert.svelte';
	import { compact, MISSING } from '../format';
	import type { DataState } from '../types';
	import { createReadSource } from '$lib/wallet/read';
	import {
		BLOCK_REWARD_LAG_ALERT_ROUNDS,
		loadBlockRewardFunding,
		loadBlockRewardsDaily,
		loadBlockRewardStatus,
		loadNetworkBlockRewardsDaily,
		mimirLagRounds
	} from '$lib/wallet/blockRewards';
	import {
		blockRewardContract,
		blockRewardCount,
		blockRewardForecast,
		chanceText,
		createBlockRewardsState,
		historyTotals,
		lagMinutes
	} from '$lib/wallet/blockRewardsCard';
	import { readLastRound, readOnlineStake } from '$lib/rewards/blockRewardChain';
	import { FORECAST_PERIOD_SECONDS, networkPace } from '$lib/rewards/blockRewardForecast';
	import { BLOCK_REWARDS_UNKNOWN_TEXT } from '$lib/rewards/blockRewardStatus';

	let {
		pageAddress,
		isContract = false,
		ownerLookup = 'ok',
		onretrylookup,
		now
	}: {
		pageAddress: string;
		isContract?: boolean;
		/** 'unavailable' when the page could not tell whether this address is a staking contract. */
		ownerLookup?: 'ok' | 'unavailable';
		onretrylookup?: () => void;
		now?: Date;
	} = $props();
	let clock = $state(new Date());
	let at = $derived(now ?? clock);
	let sources = $state(createBlockRewardsState());
	const readers = {
		status: createReadSource(
			(address, force) => loadBlockRewardStatus(address, { isContract, force }),
			(result) => (sources.status = result)
		),
		funding: createReadSource(
			() => loadBlockRewardFunding(),
			(result) => (sources.funding = result)
		),
		// Thirty days, as on the rewards tab, so both share one cached read.
		daily: createReadSource(
			(address, force) => loadBlockRewardsDaily(address, 30, force),
			(result) => (sources.daily = result)
		),
		network: createReadSource(
			(_, force) => loadNetworkBlockRewardsDaily(30, force),
			(result) => (sources.network = result)
		),
		onlineStake: createReadSource(
			() => readOnlineStake(),
			(result) => (sources.onlineStake = result)
		),
		lastRound: createReadSource(
			() => readLastRound(),
			(result) => (sources.lastRound = result)
		)
	};
	type ReaderKey = keyof typeof readers;
	function retry(source: ReaderKey) {
		return readers[source].load(pageAddress, true);
	}
	function refresh(address = pageAddress) {
		for (const reader of Object.values(readers)) void reader.load(address, true);
	}
	$effect(() => {
		const address = pageAddress;
		void isContract;
		untrack(() => {
			for (const reader of Object.values(readers)) void reader.load(address);
		});
		return () => {
			for (const reader of Object.values(readers)) reader.dispose();
		};
	});
	onMount(() => {
		const timer = setInterval(() => (clock = new Date()), 30000);
		return () => clearInterval(timer);
	});

	let contract = $derived(blockRewardContract(isContract, ownerLookup));
	let contractUnknown = $derived(contract === 'unknown');
	let status = $derived(sources.status.value);
	let funding = $derived(sources.funding.value);
	let fundingPaused = $derived(funding?.funding === 'paused');
	let fundingUnknown = $derived(
		sources.funding.state === 'error' || funding?.funding === 'unknown'
	);
	// Pace is judged at the time the network rows were read, as on the rewards tab.
	let pace = $derived(
		sources.network.value
			? networkPace(sources.network.value, new Date(sources.network.asOf))
			: null
	);
	let lag = $derived(
		sources.network.value && sources.lastRound.value !== undefined
			? mimirLagRounds(sources.lastRound.value, sources.network.value)
			: null
	);
	let totals = $derived(historyTotals(sources.daily.value ?? [], at));
	let historyState: DataState = $derived(
		sources.daily.state === 'empty' ? 'ready' : sources.daily.state
	);
	let forecast = $derived(blockRewardForecast(sources, FORECAST_PERIOD_SECONDS.day));
	const forecastSources = ['status', 'funding', 'network', 'onlineStake', 'lastRound'] as const;
	let notRegistered = $derived(!contractUnknown && status?.registered === false);
	let forecastState: DataState = $derived(
		contractUnknown
			? 'error'
			: notRegistered
				? 'ready'
				: forecastSources.some((key) => sources[key].state === 'loading')
					? 'loading'
					: forecast
						? 'ready'
						: 'error'
	);
	function retryForecast() {
		for (const key of forecastSources) void retry(key);
	}
	function amount(value: number) {
		return value > 0 && value < 0.01 ? '<0.01 VOI' : `${compact(value, 2)} VOI`;
	}
</script>

<Card title="Block rewards" span={{ lg: 12, md: 2 }}>
	{#snippet actions()}<Button variant="soft" onclick={() => refresh()}>Refresh block rewards</Button
		>{/snippet}
	<div class="min-w-0 space-y-4">
		<div class="space-y-2">
			{#if contractUnknown}
				<InlineAlert
					message="Block reward registration status unavailable"
					onretry={onretrylookup}
				/>
			{:else if status}
				{#if status.registered}
					<StatusPill tone="ok" label="Registered for block rewards" />
				{:else}
					<StatusPill tone="warn" label="Not registered for block rewards" />
					<ul class="space-y-1 text-sm [overflow-wrap:anywhere]">
						{#each status.reasons as reason (reason.code)}<li>{reason.text}</li>{/each}
					</ul>
				{/if}
			{:else if sources.status.state === 'error'}
				<InlineAlert
					message="Block reward registration status unavailable"
					onretry={() => void retry('status')}
				/>
			{:else}
				<div aria-busy="true" class="h-7 w-56 max-w-full rounded-ds-xs bg-grid">
					<span class="sr-only">Loading block reward registration status…</span>
				</div>
			{/if}
		</div>
		{#if fundingPaused}
			<BlockRewardsPausedAlert />
		{:else if fundingUnknown}
			<InlineAlert
				tone="warn"
				message={BLOCK_REWARDS_UNKNOWN_TEXT}
				onretry={() => void retry('funding')}
			/>
		{/if}
		{#if lag !== null && lag > BLOCK_REWARD_LAG_ALERT_ROUNDS}
			{@const minutes = lagMinutes(lag, pace)}
			<InlineAlert
				tone="warn"
				message={`Block reward history is about ${minutes} minute${minutes === 1 ? '' : 's'} behind the chain.`}
			/>
		{/if}
		<div class="grid min-w-0 gap-3 sm:grid-cols-3">
			{#each [{ label: 'Today (UTC)', total: totals.today }, { label: 'Last 7 days', total: totals.week }] as item (item.label)}
				<StatTile
					label={item.label}
					value={amount(item.total.amount / 1e6)}
					detail={blockRewardCount(item.total.count)}
					state={historyState}
					asOf={sources.daily.asOf}
					onretry={() => void retry('daily')}
				/>
			{/each}
			<StatTile
				label="Chance of a block reward · next 24 hours"
				value={notRegistered ? 'Not registered' : forecast ? chanceText(forecast.chance) : MISSING}
				state={forecastState}
				onretry={contractUnknown ? onretrylookup : retryForecast}
			/>
		</div>
		{#if fundingPaused}<p class="text-label text-ink-muted">
				Forecast shows rewards while funded.
			</p>{/if}
	</div>
	<a href="#rewards" class="mt-4 inline-block font-bold text-accent underline"
		>Details<span class="sr-only"> on block rewards</span> →</a
	>
</Card>
