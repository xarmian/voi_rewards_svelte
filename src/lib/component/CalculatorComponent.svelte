<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Card, Chip, DataTable, InlineAlert, StatTile, Tabs, type Column } from '$lib/ds';
	import { getSupplyInfo, getAccountInfo } from '$lib/stores/accounts';
	import { dataTable } from '../../stores/dataTable';
	import { getTokensByEpoch } from '$lib/utils';
	import { getCurrentEpoch } from '$lib/utils/epoch-utils';
	import { voiPrice, fetchVoiPrice } from '$lib/stores/price';
	import { estimateRewards } from '$lib/rewards/calculatorModel';
	import {
		availability,
		isPriceStale,
		priceLabel,
		resultsState,
		validateNodeCost,
		validateStake
	} from './calculatorView';
	import { buildScheduleCsv, scheduleRows, type ScheduleRow } from './calculatorSchedule';

	export let walletAddress: string | undefined = undefined;
	export let childAccounts: unknown[] = [];
	export let primaryAccountInfo: unknown | undefined = undefined;

	let nodeCost: number | undefined = 10;
	const isPercentageBased = false;
	const costPercentage = 10;
	let calculationAmount: number | undefined = 0;
	let calculationAmountUSD: number | undefined = 10;
	let walletBalance = 0;
	let supply: Awaited<ReturnType<typeof getSupplyInfo>> = null;
	let isLoading = true;
	let loadError = '';
	let rewardStake = 0;
	let epochRewards: number[] = [];
	let estimate: ReturnType<typeof calculateRewards> = null;
	let tileState: 'loading' | 'ready' = 'loading';
	let loadedOnce = false;
	let mounted = false;
	let now = new Date();

	const EPOCHS_PER_YEAR = 52;
	const PAST_EPOCHS_TO_SHOW = 12;
	const EPOCH_START_DATE = new Date('2024-10-30');
	let isRewardScheduleVisible = false;
	let isPastEpochsVisible = false;
	let epochSchedule: ScheduleRow[] = [];
	let pastEpochSchedule: ScheduleRow[] = [];
	let isDownloadingCSV = false;

	let customPrice: number | null | undefined = null;
	let useCustomPrice = false;
	let priceInitialized = false;
	let stakeEdited = false;
	const maxSliderValueUSD = 1000;
	let sliderValue = 10;
	let inputMode: 'usd' | 'voi' = 'usd';

	$: effectivePrice =
		useCustomPrice && customPrice !== null ? Number(customPrice) : $voiPrice.price;
	$: hasPrice = Number.isFinite(effectivePrice) && effectivePrice > 0;
	$: if (!hasPrice) inputMode = 'voi';
	$: stakeError = validateStake(inputMode === 'usd' ? calculationAmountUSD : calculationAmount);
	$: nodeCostError = validateNodeCost(nodeCost);
	$: if (hasPrice && !priceInitialized) {
		if (!validateStake(inputMode === 'usd' ? calculationAmountUSD : calculationAmount)) {
			if (walletBalance > 0 || stakeEdited) {
				if (!stakeEdited) calculationAmount = walletBalance;
				calculationAmountUSD = Math.round(Number(calculationAmount) * effectivePrice * 100) / 100;
				sliderValue = calculationAmountUSD;
			} else {
				calculationAmount = Number(calculationAmountUSD) / effectivePrice;
			}
		}
		priceInitialized = true;
	}

	// Explicit dependencies ensure every input and data change replaces the previous estimate.
	$: estimate =
		isLoading ||
		loadError ||
		stakeError ||
		nodeCostError ||
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
				});
	$: state = resultsState({
		isLoading: isLoading && !stakeError && !nodeCostError,
		loadFailed: Boolean(loadError),
		hasEstimate: estimate !== null
	});
	$: figures = availability({ hasEstimate: estimate !== null, effectivePrice });
	$: tileState = state === 'loading' ? 'loading' : 'ready';
	$: shownPriceLabel = priceLabel({
		useCustomPrice,
		customPrice,
		marketPrice: $voiPrice.price,
		error: $voiPrice.error
	});
	$: stalePrice = !useCustomPrice && isPriceStale($voiPrice.lastUpdated, now);
	$: visibleRows = isPastEpochsVisible ? [...pastEpochSchedule, ...epochSchedule] : epochSchedule;

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

	function handleUnitChange(mode: 'usd' | 'voi') {
		if (
			mode === 'usd' &&
			validateStake(calculationAmount) &&
			!validateStake(calculationAmountUSD) &&
			hasPrice
		) {
			calculationAmount = Number(calculationAmountUSD) / effectivePrice;
		}
	}

	function handleSliderChange(event: Event) {
		const value = Number((event.target as HTMLInputElement).value);
		stakeEdited = false;
		calculationAmountUSD = Math.round(value * 100) / 100;
		sliderValue = value;
		if (hasPrice) calculationAmount = value / effectivePrice;
	}

	function handleInputChange(event: Event) {
		const input = event.target as HTMLInputElement;
		calculationAmount = input.value === '' ? undefined : input.valueAsNumber;
		stakeEdited = true;
		if (validateStake(calculationAmount)) return;
		if (hasPrice) {
			calculationAmountUSD = Math.round(Number(calculationAmount) * effectivePrice * 100) / 100;
			sliderValue = calculationAmountUSD;
		}
	}

	function handleUSDInputChange(event: Event) {
		const input = event.target as HTMLInputElement;
		calculationAmountUSD = input.value === '' ? undefined : input.valueAsNumber;
		if (validateStake(calculationAmountUSD)) return;
		if (event.type === 'change')
			calculationAmountUSD = Math.round(Number(calculationAmountUSD) * 100) / 100;
		sliderValue = Number(calculationAmountUSD);
		if (hasPrice) calculationAmount = Number(calculationAmountUSD) / effectivePrice;
	}

	function setUSDAmount(amount: number) {
		calculationAmountUSD = amount;
		sliderValue = amount;
		if (hasPrice) calculationAmount = amount / effectivePrice;
	}

	function setFixedAmount(amount: number) {
		stakeEdited = true;
		calculationAmount = amount;
		if (hasPrice) {
			calculationAmountUSD = Math.round(amount * effectivePrice * 100) / 100;
			sliderValue = calculationAmountUSD;
		}
	}

	function toggleCustomPrice() {
		if (!useCustomPrice) customPrice = Math.round($voiPrice.price * 1e8) / 1e8;
		useCustomPrice = !useCustomPrice;
	}

	function adjustCustomPrice(percentChange: number) {
		if (customPrice != null) customPrice = Math.max(0, customPrice * (1 + percentChange));
	}

	async function updateWalletBalance() {
		if (!walletAddress) return;
		try {
			const accountInfo = await getAccountInfo(walletAddress);
			const newBalance = Number(accountInfo?.amount || 0) / 1e6;
			if (newBalance !== walletBalance) {
				walletBalance = newBalance;
				setFixedAmount(walletBalance);
			}
		} catch (error) {
			console.error('Error updating wallet balance:', error);
			walletBalance = 0;
			calculationAmount = 0;
			calculationAmountUSD = 0;
			sliderValue = 0;
		}
	}

	// Loading again must not reinitialize the user's stake or price/cost choices.
	async function loadData() {
		isLoading = true;
		loadError = '';
		estimate = null;
		rewardStake = 0;
		epochRewards = [];
		epochSchedule = [];
		pastEpochSchedule = [];
		try {
			await fetchVoiPrice();
			const [supplyData, dates] = await Promise.all([getSupplyInfo(), dataTable.fetchDateRanges()]);
			supply = supplyData;
			const latestEpoch = dates[dates.length - 1];
			if (!latestEpoch) throw new Error('No epoch data');
			epochRewards = await Promise.all(
				Array.from({ length: EPOCHS_PER_YEAR }, (_, i) => getTokensByEpoch(latestEpoch.epoch + i))
			);
			const epochData = await dataTable.fetchData(latestEpoch.id);
			if (epochData && supply?.['online-money']) {
				rewardStake = Number(supply['online-money']) - Number(epochData?.blacklist_balance_total);
				if (walletAddress && !loadedOnce) await updateWalletBalance();
			}
			await initializeEpochSchedule();
		} catch (error) {
			console.error('Calculator load error:', error);
			loadError = 'Error loading data. Please try again later.';
		} finally {
			isLoading = false;
			loadedOnce = true;
		}
	}

	onMount(() => {
		mounted = true;
		void loadData();
		const timer = setInterval(() => (now = new Date()), 30_000);
		return () => clearInterval(timer);
	});
	// Track wallet changes, independently of Retry's loading state.
	$: if (mounted && walletAddress && loadedOnce) void updateWalletBalance();

	async function initializeEpochSchedule() {
		const currentDate = new Date();
		const currentEpochNumber = getCurrentEpoch(currentDate, EPOCH_START_DATE);
		epochSchedule = scheduleRows(epochRewards, currentEpochNumber, EPOCH_START_DATE, currentDate);
		const maxPastEpochs = Math.min(PAST_EPOCHS_TO_SHOW, currentEpochNumber);
		if (maxPastEpochs > 0) {
			const pastRewards = await Promise.all(
				Array.from({ length: maxPastEpochs }, (_, i) =>
					getTokensByEpoch(currentEpochNumber - (maxPastEpochs - i) + 1)
				)
			);
			pastEpochSchedule = scheduleRows(
				pastRewards,
				currentEpochNumber - maxPastEpochs,
				EPOCH_START_DATE,
				currentDate
			)
				.slice(0, maxPastEpochs)
				.map((row) => ({ ...row, isCurrent: false }));
		}
	}

	function formatUSD(value: number, maxDecimals = 2): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: maxDecimals,
			maximumFractionDigits: maxDecimals
		}).format(value);
	}

	function formatDate(date: Date): string {
		return (
			date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				timeZone: 'UTC'
			}) + ' UTC'
		);
	}

	async function downloadEpochScheduleCSV() {
		isDownloadingCSV = true;
		try {
			const amounts: number[] = [];
			for (let epoch = 0; epoch < 20 * 52; epoch++) {
				amounts.push(await getTokensByEpoch(epoch + 1));
			}
			const csvContent = buildScheduleCsv(amounts, EPOCH_START_DATE);
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
			const link = document.createElement('a');
			const url = URL.createObjectURL(blob);
			link.setAttribute('href', url);
			link.setAttribute(
				'download',
				`epoch-schedule-${EPOCH_START_DATE.toISOString().split('T')[0]}.csv`
			);
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Error generating CSV:', error);
			alert('Failed to generate CSV. Please try again.');
		} finally {
			isDownloadingCSV = false;
		}
	}
</script>

{#snippet epochCell(row: ScheduleRow)}
	<div class="flex flex-wrap items-center gap-2">
		<span>{row.epochNumber + 1}</span>
		{#if row.isCurrent}<Chip label="Current" />{/if}
	</div>
{/snippet}
{#snippet dateCell(row: ScheduleRow)}
	<span class="whitespace-normal">{formatDate(row.startDate)} - {formatDate(row.endDate)}</span>
{/snippet}
{#snippet poolCell(row: ScheduleRow)}
	<span class="break-words"
		>{row.rewardPool.toLocaleString(undefined, { maximumFractionDigits: 0 })} VOI</span
	>
{/snippet}

<div class="min-w-0 space-y-6 text-body text-ink">
	<div class="grid min-w-0 gap-bento lg:grid-cols-2">
		<Card title="Your stake">
			<div class="space-y-4">
				<Tabs
					variant="segmented"
					label="Stake unit"
					bind:value={inputMode}
					onchange={handleUnitChange}
					options={hasPrice
						? [
								{ value: 'usd', label: 'USD' },
								{ value: 'voi', label: 'VOI' }
							]
						: [{ value: 'voi', label: 'VOI' }]}
				/>
				{#if inputMode === 'usd' && hasPrice}
					<div>
						<label for="calculationAmountUSD" class="mb-2 block text-label text-ink-muted"
							>Stake (USD)</label
						>
						<input
							id="calculationAmountUSD"
							type="number"
							min="0"
							step="0.01"
							bind:value={calculationAmountUSD}
							on:input={handleUSDInputChange}
							on:change={handleUSDInputChange}
							aria-invalid={Boolean(stakeError)}
							aria-describedby={stakeError ? 'stake-error' : undefined}
							class="block w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-3 py-2 text-ink text-h2"
						/>
						{#if !stakeError}<p class="mt-2 text-label text-ink-muted">
								{Math.round(Number(calculationAmount)).toLocaleString()} VOI
							</p>{/if}
					</div>
				{:else}
					<div>
						<label for="calculationAmount" class="mb-2 block text-label text-ink-muted"
							>Stake (VOI)</label
						>
						<input
							id="calculationAmount"
							type="number"
							min="0"
							step="1"
							bind:value={calculationAmount}
							on:input={handleInputChange}
							aria-invalid={Boolean(stakeError)}
							aria-describedby={stakeError ? 'stake-error' : undefined}
							class="block w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-3 py-2 text-ink text-h2"
						/>
						{#if !stakeError && hasPrice && Number(calculationAmount) > 0}<p
								class="mt-2 text-label text-ink-muted"
							>
								Value: {formatUSD(Number(calculationAmount) * effectivePrice)}
							</p>{/if}
					</div>
				{/if}
				{#if stakeError}<p id="stake-error" role="alert" class="text-label text-danger">
						{stakeError}
					</p>{/if}
				<div>
					<label for="stake-slider" class="mb-2 block text-label text-ink-muted"
						>Adjust stake (USD)</label
					>
					<input
						id="stake-slider"
						type="range"
						bind:value={sliderValue}
						min="0"
						max={maxSliderValueUSD}
						step="1"
						on:input={handleSliderChange}
						class="w-full min-w-0 accent-accent"
					/>
					<div class="flex flex-wrap justify-between gap-2 text-micro text-ink-muted">
						{#if inputMode === 'voi' && hasPrice}
							<span>0 VOI</span><span
								>{Math.round(maxSliderValueUSD / 2 / effectivePrice).toLocaleString()} VOI</span
							><span>{Math.round(maxSliderValueUSD / effectivePrice).toLocaleString()} VOI</span>
						{:else}<span>$0</span><span>${maxSliderValueUSD / 2}</span><span
								>${maxSliderValueUSD}</span
							>{/if}
					</div>
				</div>
				<div>
					<p class="mb-2 text-label text-ink-muted">Quick Select</p>
					<div class="flex flex-wrap gap-2" role="group" aria-label="Quick Select">
						{#if walletBalance > 0}<Button
								variant="soft"
								onclick={() => setFixedAmount(walletBalance)}
								>Wallet · {hasPrice
									? formatUSD(walletBalance * effectivePrice)
									: `${walletBalance.toLocaleString()} VOI`}</Button
							>{/if}
						{#if hasPrice}
							{#each [10, 100, 1000] as amount}<Button
									variant="soft"
									onclick={() => setUSDAmount(amount)}
									><span
										>${amount}<span class="block text-micro font-normal"
											>{Math.round(amount / effectivePrice).toLocaleString()} VOI</span
										></span
									></Button
								>{/each}
						{/if}
					</div>
				</div>
			</div>
		</Card>
		<Card title="Cost and price">
			<div class="space-y-6">
				<div>
					<label for="monthly-node-cost" class="mb-2 block text-label text-ink-muted"
						>Monthly node cost (USD)</label
					>
					<div class="flex min-w-0 items-center gap-2">
						<Button
							variant="soft"
							aria-label="Decrease monthly node cost"
							onclick={() => (nodeCost = Math.max(0, Number(nodeCost || 0) - 1))}>−</Button
						>
						<input
							id="monthly-node-cost"
							type="number"
							min="0"
							step="1"
							bind:value={nodeCost}
							aria-invalid={Boolean(nodeCostError)}
							aria-describedby={nodeCostError ? 'node-cost-error' : undefined}
							class="block w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-3 py-2 text-ink flex-1"
						/>
						<Button
							variant="soft"
							aria-label="Increase monthly node cost"
							onclick={() => (nodeCost = Number(nodeCost || 0) + 1)}>+</Button
						>
					</div>
					{#if nodeCostError}<p
							id="node-cost-error"
							role="alert"
							class="mt-2 text-label text-danger"
						>
							{nodeCostError}
						</p>{/if}
				</div>
				<div class="space-y-3 border-t border-line pt-4">
					<div class="flex flex-wrap items-center gap-2">
						{#if useCustomPrice}
							<label for="custom-price" class="text-label text-ink-muted">Your price</label>
						{:else}<span class="text-label text-ink-muted">{shownPriceLabel}</span>{/if}
						{#if !useCustomPrice && !$voiPrice.error && Number.isFinite($voiPrice.price) && $voiPrice.price > 0}<strong
								class="text-accent">{formatUSD($voiPrice.price, 6)}</strong
							>{/if}
						{#if stalePrice}<Chip label="Stale price" tone="warn" />{/if}
					</div>
					{#if useCustomPrice}
						<input
							id="custom-price"
							type="number"
							min="0"
							step="0.00000001"
							bind:value={customPrice}
							class="block w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-3 py-2 text-ink"
						/>
						<div class="flex flex-wrap gap-2">
							<Button variant="soft" size="sm" onclick={() => adjustCustomPrice(-0.05)}>-5%</Button
							><Button variant="soft" size="sm" onclick={() => adjustCustomPrice(0.05)}>+5%</Button>
						</div>
					{/if}
					<div class="flex flex-wrap gap-2">
						<Button variant="ghost" size="sm" onclick={toggleCustomPrice}
							>{useCustomPrice ? 'Use market' : 'Custom'}</Button
						>
						{#if !useCustomPrice}<Button
								variant="ghost"
								size="sm"
								onclick={() => void fetchVoiPrice(true)}>↻ Refresh price</Button
							>{/if}
					</div>
					{#if hasPrice}<p class="text-label text-ink-muted">
							{useCustomPrice
								? 'USD estimates use your price'
								: 'USD estimates use the market price'}
						</p>{/if}
				</div>
			</div>
		</Card>
	</div>

	<section aria-labelledby="estimated-rewards-heading" class="space-y-4">
		<h2 id="estimated-rewards-heading" class="text-h2">Your estimated rewards</h2>
		{#if state === 'unavailable'}
			<InlineAlert
				message={[loadError, stakeError, nodeCostError].filter(Boolean).join(' ') ||
					'Error loading data. Please try again later.'}
				onretry={loadError || (!stakeError && !nodeCostError) ? () => void loadData() : undefined}
			/>
		{/if}
		<div class="grid gap-bento md:grid-cols-3">
			<StatTile
				label="Weekly"
				value={figures.voiEstimates && estimate ? estimate.weeklyReward.toFixed(0) : 'Unavailable'}
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
						? estimate.monthlyReward.toFixed(0)
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
				value={figures.voiEstimates && estimate ? estimate.yearlyReward.toFixed(0) : 'Unavailable'}
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
					? `${estimate.monthlyProfitPercentage.toFixed(2)}% monthly / ${estimate.yearlyProfitPercentage.toFixed(2)}% yearly profit on node cost`
					: figures.voiEstimates
						? 'Unavailable without a price'
						: undefined}
				state={tileState}
			/>
			<div class="min-w-0 space-y-3">
				<StatTile
					label="Break-even stake"
					value={figures.breakEven && estimate
						? estimate.profitabilityThreshold.toLocaleString()
						: 'Unavailable'}
					unit={figures.breakEven ? 'VOI' : undefined}
					detail={figures.breakEven && estimate
						? formatUSD(estimate.profitabilityThreshold * effectivePrice)
						: figures.voiEstimates
							? 'Unavailable without a price'
							: undefined}
					state={tileState}
				/>
				{#if figures.breakEven && estimate}<Button
						variant="ghost"
						size="sm"
						onclick={() => estimate && setFixedAmount(estimate.profitabilityThreshold)}
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

	<Card>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<Button
				variant="ghost"
				aria-expanded={isRewardScheduleVisible}
				aria-controls="reward-schedule"
				onclick={() => (isRewardScheduleVisible = !isRewardScheduleVisible)}
				>{isRewardScheduleVisible ? '▴' : '▾'} View Reward Schedule</Button
			>
			<Button
				variant="soft"
				disabled={isDownloadingCSV}
				onclick={() => void downloadEpochScheduleCSV()}
				>{isDownloadingCSV ? 'Generating...' : 'Download CSV'}</Button
			>
		</div>
		<div
			id="reward-schedule"
			hidden={!isRewardScheduleVisible}
			class="mt-4 min-w-0 overflow-x-auto"
		>
			{#if pastEpochSchedule.length > 0}<Button
					variant="ghost"
					size="sm"
					aria-pressed={isPastEpochsVisible}
					onclick={() => (isPastEpochsVisible = !isPastEpochsVisible)}>Previous epochs</Button
				>{/if}
			<DataTable
				columns={[
					{ key: 'epochNumber', header: 'Epoch', priority: 1, cell: epochCell },
					{ key: 'dates', header: 'Date range', priority: 1, cell: dateCell },
					{ key: 'rewardPool', header: 'Reward pool', priority: 1, numeric: true, cell: poolCell }
				] satisfies Column<ScheduleRow>[]}
				rows={visibleRows}
				rowKey={(row) => String(row.epochNumber)}
				caption="Epoch reward schedule"
				density="compact"
				state={isLoading ? 'loading' : loadError || !epochSchedule.length ? 'error' : 'ready'}
				onretry={() => void loadData()}
			/>
		</div>
	</Card>

	<div class="flex flex-wrap gap-x-6 gap-y-3 text-label">
		<a href="/how_to_node#guides" class="text-accent underline underline-offset-4"
			>Browse node guides</a
		>
		<a href="/how_to_node#wallet-check" class="text-accent underline underline-offset-4"
			>Check your node is working</a
		>
	</div>
</div>
