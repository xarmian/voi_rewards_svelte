<script lang="ts">
	import { Button, InlineAlert, StatTile, compact } from '$lib/ds';
	import { retryKeepingFocus } from '$lib/ds/retryFocus';
	import { voiPrice } from '$lib/stores/price';
	import { estimateRewards } from '$lib/epochRewards/calculator/model';
	import {
		availability,
		breakEvenTile,
		profitPercentageText,
		resultsState,
		validateNodeCost
	} from './view';
	import type { EpochCalculator } from './state.svelte';

	// The calculator's "Your estimated rewards" section, moved here unchanged.
	let {
		calc,
		calculationAmount,
		effectivePrice,
		nodeCost,
		stakeError,
		priceError,
		onusestake
	}: {
		calc: EpochCalculator;
		calculationAmount: number | undefined;
		effectivePrice: number;
		nodeCost: number | undefined;
		stakeError: string | null;
		priceError: string | null;
		onusestake: (amount: number) => void;
	} = $props();

	const isPercentageBased = false;
	const costPercentage = 10;
	let estimateSection: HTMLElement | undefined = $state();
	let { isLoading, loadError, supply, rewardStake, epochRewards } = $derived(calc.state);
	let nodeCostError = $derived(validateNodeCost(nodeCost));

	// Explicit dependencies ensure every input and data change replaces the previous estimate.
	let estimate = $derived(
		isLoading ||
			loadError ||
			stakeError ||
			nodeCostError ||
			priceError ||
			!Number.isFinite(Number(supply?.['online-money'])) ||
			!Number.isFinite(rewardStake) ||
			epochRewards.length === 0 ||
			!epochRewards.every(Number.isFinite)
			? null
			: calculateRewards({
					stake: Number(calculationAmount),
					price: effectivePrice,
					onlineMoney: Number(supply?.['online-money']),
					rewardStake,
					epochRewards,
					nodeCost: Number(nodeCost),
					isPercentageBased,
					costPercentage
				})
	);
	let results = $derived(
		resultsState({
			isLoading: isLoading && !stakeError && !nodeCostError && !priceError,
			loadFailed: Boolean(loadError),
			hasEstimate: estimate !== null
		})
	);
	let figures = $derived(availability({ hasEstimate: estimate !== null, effectivePrice }));
	let shownBreakEven = $derived(
		breakEvenTile({
			hasEstimate: estimate !== null,
			effectivePrice,
			reached: estimate?.breakEvenReached ?? false,
			threshold: estimate?.profitabilityThreshold ?? 0
		})
	);
	let tileState: 'loading' | 'ready' = $derived(results === 'loading' ? 'loading' : 'ready');

	// Preserve the existing field assignments checked by the calculator wiring guard.
	function calculateRewards(input: Parameters<typeof estimateRewards>[0]) {
		const estimate = estimateRewards(input);
		if (estimate === null) return null;
		let expectedWeeklyBlocks: number;
		let expectedMonthlyBlocks: number;
		let expectedYearlyBlocks: number;
		let apr: number;
		let apy: number;
		let profitabilityThreshold: number;
		let breakEvenReached: boolean;
		let weeklyReward: number;
		let weeklyRewardUSD: number;
		let monthlyReward: number;
		let monthlyRewardUSD: number;
		let monthlyProfit: number;
		let monthlyProfitPercentage: number;
		let yearlyReward: number;
		let yearlyRewardUSD: number;
		let yearlyProfitPercentage: number;
		let balanceAfterWeek: number;
		let balanceAfterMonth: number;
		let balanceAfterYear: number;

		expectedWeeklyBlocks = estimate.expectedWeeklyBlocks;
		expectedMonthlyBlocks = estimate.expectedMonthlyBlocks;
		expectedYearlyBlocks = estimate.expectedYearlyBlocks;
		apr = estimate.apr;
		apy = estimate.apy;
		profitabilityThreshold = estimate.profitabilityThreshold;
		breakEvenReached = estimate.breakEvenReached;
		weeklyReward = estimate.weeklyReward;
		weeklyRewardUSD = estimate.weeklyRewardUSD;
		monthlyReward = estimate.monthlyReward;
		monthlyRewardUSD = estimate.monthlyRewardUSD;
		monthlyProfit = estimate.monthlyProfit;
		monthlyProfitPercentage = estimate.monthlyProfitPercentage;
		yearlyReward = estimate.yearlyReward;
		yearlyRewardUSD = estimate.yearlyRewardUSD;
		yearlyProfitPercentage = estimate.yearlyProfitPercentage;
		balanceAfterWeek = estimate.balanceAfterWeek;
		balanceAfterMonth = estimate.balanceAfterMonth;
		balanceAfterYear = estimate.balanceAfterYear;

		return {
			expectedWeeklyBlocks,
			expectedMonthlyBlocks,
			expectedYearlyBlocks,
			apr,
			apy,
			profitabilityThreshold,
			breakEvenReached,
			weeklyReward,
			weeklyRewardUSD,
			monthlyReward,
			monthlyRewardUSD,
			monthlyProfit,
			monthlyProfitPercentage,
			yearlyReward,
			yearlyRewardUSD,
			yearlyProfitPercentage,
			balanceAfterWeek,
			balanceAfterMonth,
			balanceAfterYear
		};
	}

	function formatUSD(value: number, maxDecimals = 2): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: maxDecimals,
			maximumFractionDigits: maxDecimals
		}).format(value);
	}

	async function loadData() {
		await calc.reload();
	}
</script>

<section
	bind:this={estimateSection}
	aria-labelledby="estimated-rewards-heading"
	tabindex="-1"
	class="space-y-4 focus:outline-none"
>
	{#if calc.state.network.state === 'stale'}<p class="text-label text-warn">
			As of {new Date(calc.state.network.asOf).toUTCString()}
		</p>
		{#if calc.state.network.error}<InlineAlert
				tone="warn"
				message="Refresh failed; showing the last loaded calculator inputs."
				onretry={retryKeepingFocus(
					() => estimateSection,
					() => void loadData()
				)}
			/>{/if}{/if}
	<h2 id="estimated-rewards-heading" class="text-h2">Your estimated rewards</h2>
	{#if results === 'unavailable'}
		<InlineAlert
			message={[loadError, stakeError, nodeCostError, priceError].filter(Boolean).join(' ') ||
				'Error loading data. Please try again later.'}
			onretry={retryKeepingFocus(
				() => estimateSection,
				loadError || (!stakeError && !nodeCostError && !priceError)
					? () => void loadData()
					: undefined
			)}
		/>
	{/if}
	<div class="grid gap-bento md:grid-cols-3">
		<StatTile
			label="Weekly"
			value={figures.voiEstimates && estimate ? compact(estimate.weeklyReward, 1) : 'Unavailable'}
			unit={figures.voiEstimates ? 'VOI' : undefined}
			detail={figures.usdFigures && estimate
				? formatUSD(estimate.weeklyRewardUSD)
				: figures.voiEstimates
					? 'Unavailable without a price'
					: undefined}
			state={tileState}
		/>
		<div class="min-w-0 rounded-card ring-2 ring-accent">
			<StatTile
				label="Monthly"
				value={figures.voiEstimates && estimate
					? compact(estimate.monthlyReward, 1)
					: 'Unavailable'}
				unit={figures.voiEstimates ? 'VOI' : undefined}
				detail={figures.usdFigures && estimate
					? formatUSD(estimate.monthlyRewardUSD)
					: figures.voiEstimates
						? 'Unavailable without a price'
						: undefined}
				state={tileState}
			/>
		</div>
		<StatTile
			label="Yearly"
			value={figures.voiEstimates && estimate ? compact(estimate.yearlyReward, 1) : 'Unavailable'}
			unit={figures.voiEstimates ? 'VOI' : undefined}
			detail={figures.usdFigures && estimate
				? formatUSD(estimate.yearlyRewardUSD)
				: figures.voiEstimates
					? 'Unavailable without a price'
					: undefined}
			state={tileState}
		/>
	</div>
	<div class="grid gap-bento sm:grid-cols-2">
		<StatTile
			label="APR"
			value={figures.voiEstimates && estimate ? `${estimate.apr.toFixed(2)}%` : 'Unavailable'}
			state={tileState}
		/>
		<StatTile
			label="APY"
			value={figures.voiEstimates && estimate ? `${estimate.apy.toFixed(2)}%` : 'Unavailable'}
			state={tileState}
		/>
		<StatTile
			label="Monthly profit"
			value={figures.usdFigures && estimate ? formatUSD(estimate.monthlyProfit) : 'Unavailable'}
			detail={figures.usdFigures && estimate
				? profitPercentageText(
						Number(nodeCost),
						estimate.monthlyProfitPercentage,
						estimate.yearlyProfitPercentage
					)
				: figures.voiEstimates
					? 'Unavailable without a price'
					: undefined}
			state={tileState}
		/>
		<div class="min-w-0 space-y-3">
			<StatTile
				label="Break-even stake"
				value={shownBreakEven.value}
				unit={shownBreakEven.unit}
				detail={shownBreakEven.detail}
				state={tileState}
			/>
			{#if shownBreakEven.showUseButton}<Button
					variant="ghost"
					size="sm"
					onclick={() => estimate && onusestake(estimate.profitabilityThreshold)}
					>Use break-even stake</Button
				>{/if}
		</div>
	</div>
	{#if figures.usdFigures && estimate && estimate.monthlyProfit < 0}<p
			class="text-body text-ink-muted"
		>
			At this stake the estimated monthly rewards are below your monthly node cost.
		</p>{/if}
	<div
		class="space-y-2 rounded-card border border-line bg-surface-2 p-card text-label text-ink-muted"
	>
		<p>* Calculations assume current network conditions and weekly compounding of rewards.</p>
		<p>* Actual rewards and rates may vary based on network participation and other factors.</p>
		<p>* This tool is for entertainment purposes only. It is not financial advice.</p>
		<p>
			{#if $voiPrice.lastUpdated}Data as of {$voiPrice.lastUpdated.toLocaleString('en-US', {
					timeZone: 'UTC',
					timeZoneName: 'short'
				})} (market price).{:else}Market price timestamp unavailable.{/if}
		</p>
	</div>
</section>
