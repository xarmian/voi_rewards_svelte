<script lang="ts">
	import StatTile from '$lib/ds/StatTile/StatTile.svelte';
	import InlineAlert from '$lib/ds/InlineAlert/InlineAlert.svelte';
	import BlockRewardsPausedAlert from '$lib/ds/BlockRewardsPausedAlert/BlockRewardsPausedAlert.svelte';
	import RealtimeTestingBadge from '$lib/ds/RealtimeTestingBadge/RealtimeTestingBadge.svelte';
	import { compact, usd } from '$lib/ds/format';
	import { createReadSource } from '$lib/wallet/read';
	import { loadBlockRewardFunding, loadNetworkBlockRewardsDaily } from '$lib/wallet/blockRewards';
	import { chanceText, weekForecastText } from '$lib/wallet/blockRewardsCard';
	import { readLastRound, readOnlineStake } from '$lib/rewards/blockRewardChain';
	import { FORECAST_ASSUMPTIONS, type Forecast } from '$lib/rewards/blockRewardForecast';
	import { REALTIME_BLOCK_REWARDS_TITLE } from '$lib/rewards/blockRewardLabels';
	import {
		BLOCK_REWARD_FEE_NOTE,
		CALCULATOR_BLOCK_REWARD_SOURCES,
		OUT_OF_RANGE_TEXT,
		calculatorBlockRewardInputs,
		createCalculatorBlockRewardsState,
		rateText,
		type CalculatorBlockRewardSource
	} from './calculatorBlockRewards';

	let { stake, price }: { stake: number | null; price: number | null } = $props();

	const HEADING = `Estimated ${REALTIME_BLOCK_REWARDS_TITLE.toLowerCase()}`;
	const KEY = 'calculator';
	let sources = $state(createCalculatorBlockRewardsState());
	const readers = {
		funding: createReadSource(
			() => loadBlockRewardFunding(),
			(result) => (sources.funding = result)
		),
		// Thirty days, as on the wallet, home and analytics views, so all share one cached read.
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
	// Effects do not run on the server, so the server render stays the loading state.
	$effect(() => {
		for (const reader of Object.values(readers)) void reader.load(KEY);
		return () => {
			for (const reader of Object.values(readers)) reader.dispose();
		};
	});
	function retry() {
		const failed = CALCULATOR_BLOCK_REWARD_SOURCES.filter((key) => sources[key].error);
		const keys: CalculatorBlockRewardSource[] = failed.length
			? failed
			: CALCULATOR_BLOCK_REWARD_SOURCES;
		for (const key of keys) void readers[key].load(KEY, true);
	}

	let inputs = $derived(calculatorBlockRewardInputs(stake, sources));
	let fundingPaused = $derived(sources.funding.value?.funding === 'paused');
	let tileState: 'loading' | 'ready' = $derived(inputs.kind === 'loading' ? 'loading' : 'ready');
	let ready = $derived(inputs.kind === 'ready' ? inputs : null);
	let periods = $derived([
		{ label: 'Daily', forecast: ready?.day },
		{ label: 'Monthly', forecast: ready?.month },
		{ label: 'Yearly', forecast: ready?.year }
	]);

	function voi(forecast: Forecast) {
		const value = forecast.expectedMicroVoi / 1e6;
		return compact(value, value < 10 ? 2 : 1);
	}
	function usdDetail(forecast: Forecast | undefined) {
		if (!forecast) return undefined;
		return price !== null && Number.isFinite(price) && price > 0
			? usd((forecast.expectedMicroVoi / 1e6) * price)
			: 'Unavailable without a price';
	}
</script>

<section aria-labelledby="estimated-block-rewards-heading" class="space-y-4">
	<div class="flex min-w-0 flex-wrap items-center gap-2">
		<h2 id="estimated-block-rewards-heading" class="text-h2">{HEADING}</h2>
		<RealtimeTestingBadge />
	</div>
	{#if fundingPaused}<BlockRewardsPausedAlert />{/if}
	{#if inputs.kind === 'out-of-range'}
		<p class="text-body text-ink-muted">{OUT_OF_RANGE_TEXT}</p>
	{:else}
		{#if inputs.kind === 'error'}
			<InlineAlert message="Real-time block reward estimates are unavailable." onretry={retry} />
		{/if}
		<div class="grid gap-bento md:grid-cols-3">
			{#each periods as period (period.label)}
				<StatTile
					label={period.label}
					value={period.forecast ? voi(period.forecast) : 'Unavailable'}
					unit={period.forecast ? 'VOI' : undefined}
					detail={usdDetail(period.forecast)}
					state={tileState}
				/>
			{/each}
		</div>
		<div class="grid gap-bento sm:grid-cols-2">
			<StatTile
				label="Chance of a real-time block reward · next 24 hours"
				value={ready ? chanceText(ready.next24h.chance) : 'Unavailable'}
				state={tileState}
			/>
			<StatTile
				label="Chance of a real-time block reward · next 7 days"
				value={ready ? chanceText(ready.next7d.chance) : 'Unavailable'}
				detail={ready ? weekForecastText(ready.next7d) : undefined}
				state={tileState}
			/>
		</div>
		{#if ready}<p class="text-body text-ink-muted">{rateText(ready.year, ready.stake)}</p>{/if}
	{/if}
	<div
		class="space-y-2 rounded-card border border-line bg-surface-2 p-card text-label text-ink-muted"
	>
		<p>* {FORECAST_ASSUMPTIONS}</p>
		<p>* {BLOCK_REWARD_FEE_NOTE}</p>
	</div>
</section>
