<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/ds/Button';
	import { Chip } from '$lib/ds/Chip';
	import { InlineAlert } from '$lib/ds/InlineAlert';
	import { Tabs } from '$lib/ds/Tabs';
	import { createReadSource, type Source } from '$lib/wallet/read';
	import { retryKeepingFocus } from '$lib/ds/retryFocus';
	import { loadCalculatorBalance, loadCalculatorPrice } from '$lib/wallet/calculator';
	import { epochCalculator } from '$lib/epochRewards/client';
	import { EpochEstimate, EpochNodeCost, EpochSchedule } from '$lib/epochRewards/components';
	import { voiPrice } from '$lib/stores/price';
	import { isPriceStale, priceLabel, validateCustomPrice, validateStake } from './calculatorView';
	import CalculatorBlockRewards from './CalculatorBlockRewards.svelte';
	import CalculatorDisclaimer from './CalculatorDisclaimer.svelte';

	export let walletAddress: string | undefined = undefined;

	let nodeCost: number | undefined = 10;
	let calculationAmount: number | undefined = 0;
	let calculationAmountUSD: number | undefined = 10;
	let walletBalance: number | null = null;
	let prefilled = false;
	let loadedAddress: string | undefined;
	let balanceSource: Source<number> = { state: 'loading' };
	let priceSource: Source<number> = { state: 'loading' };
	let mounted = false;
	let now = new Date();

	let customPrice: number | null | undefined = null;
	let useCustomPrice = false;
	let priceInitialized = false;
	let stakeEdited = false;
	const maxSliderValueUSD = 1000;
	let sliderValue = 10;
	let inputMode: 'usd' | 'voi' = 'usd';

	$: effectivePrice =
		useCustomPrice && customPrice !== null
			? Number(customPrice)
			: priceSource.error
				? NaN
				: (priceSource.value ?? NaN);
	$: hasPrice = Number.isFinite(effectivePrice) && effectivePrice > 0;
	$: if (!hasPrice) inputMode = 'voi';
	$: stakeError = validateStake(inputMode === 'usd' ? calculationAmountUSD : calculationAmount);
	$: priceError = useCustomPrice ? validateCustomPrice(customPrice) : null;
	$: if (hasPrice) syncPrice(effectivePrice, prefilled, stakeEdited);

	function syncPrice(price = effectivePrice, hasPrefill = prefilled, edited = stakeEdited) {
		if (!hasPrice) return;
		if (!priceInitialized && !walletAddress && !edited && !hasPrefill)
			calculationAmount = Number(calculationAmountUSD) / price;
		calculationAmountUSD = Math.round(Number(calculationAmount) * price * 100) / 100;
		sliderValue = calculationAmountUSD;
		priceInitialized = true;
	}
	function applyBalance(value: number) {
		walletBalance = value;
		if (!prefilled && !stakeEdited) {
			calculationAmount = value;
			inputMode = 'voi';
		}
		prefilled = true;
		syncPrice();
	}

	$: shownPriceLabel = priceLabel({
		useCustomPrice,
		customPrice,
		marketPrice: priceSource.value ?? NaN,
		error: priceSource.error ?? $voiPrice.error
	});
	$: stalePrice = !useCustomPrice && isPriceStale($voiPrice.lastUpdated, now);

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
		stakeEdited = true;
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
		stakeEdited = true;
		const input = event.target as HTMLInputElement;
		calculationAmountUSD = input.value === '' ? undefined : input.valueAsNumber;
		if (validateStake(calculationAmountUSD)) return;
		if (event.type === 'change')
			calculationAmountUSD = Math.round(Number(calculationAmountUSD) * 100) / 100;
		sliderValue = Number(calculationAmountUSD);
		if (hasPrice) calculationAmount = Number(calculationAmountUSD) / effectivePrice;
	}

	function setUSDAmount(amount: number) {
		stakeEdited = true;
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

	// Retries clear their alerts or swap them for loading; these sections keep focus in place.
	let stakeSection: HTMLElement | undefined;
	let costSection: HTMLElement | undefined;

	const epochCalc = epochCalculator();
	const balanceReader = createReadSource(loadCalculatorBalance, (result) => {
		balanceSource = result;
		if (result.value !== undefined) applyBalance(result.value);
	});
	const priceReader = createReadSource(loadCalculatorPrice, (result) => {
		priceSource = result;
	});
	function changeAddress(address: string | undefined) {
		loadedAddress = address;
		balanceReader.dispose();
		walletBalance = null;
		prefilled = false;
		stakeEdited = false;
		if (address) {
			calculationAmount = 0;
			calculationAmountUSD = 0;
			inputMode = 'voi';
		}
		void epochCalc?.load(address ?? '');
		if (address) void balanceReader.load(address);
		void priceReader.load(address ?? '');
	}
	onMount(() => {
		mounted = true;
		changeAddress(walletAddress);
		const timer = setInterval(() => (now = new Date()), 30000);
		return () => {
			clearInterval(timer);
			epochCalc?.dispose();
			balanceReader.dispose();
			priceReader.dispose();
		};
	});
	$: if (mounted && walletAddress !== loadedAddress) changeAddress(walletAddress);

	function formatUSD(value: number, maxDecimals = 2): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: maxDecimals,
			maximumFractionDigits: maxDecimals
		}).format(value);
	}
</script>

<div class="min-w-0 space-y-6 text-body text-ink">
	<div class="grid min-w-0 gap-bento lg:grid-cols-2">
		<section
			bind:this={stakeSection}
			aria-label="Your stake"
			tabindex="-1"
			class="min-w-0 space-y-4 focus:outline-none"
		>
			<h2 class="text-h2">Your stake</h2>
			{#if walletAddress}
				<p class="text-label text-ink-muted">Prefilled from this address; editable estimate.</p>
				{#if balanceSource.state === 'loading'}<div
						aria-busy="true"
						class="h-6 rounded-ds-xs bg-grid"
					>
						<span class="sr-only">Loading wallet balance…</span>
					</div>{/if}
				{#if balanceSource.state === 'stale'}<p class="text-label text-warn">
						Balance as of {new Date(balanceSource.asOf).toUTCString()}{balanceSource.error
							? ' · Refresh failed'
							: ''}
					</p>{/if}
				{#if balanceSource.error}<InlineAlert
						message="Wallet balance unavailable"
						onretry={retryKeepingFocus(
							() => stakeSection,
							() => void balanceReader.load(walletAddress!, true)
						)}
					/>{/if}
				{#if walletBalance === 0}<p class="text-label text-ink-muted">
						This address has no VOI; enter an amount to explore.
					</p>{/if}
			{/if}
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
						{#if walletAddress}<Button
								disabled={walletBalance === null}
								variant="soft"
								onclick={() => walletBalance !== null && setFixedAmount(walletBalance)}
								>Reset to wallet · {walletBalance === null
									? 'Unavailable'
									: hasPrice
										? formatUSD((walletBalance ?? 0) * effectivePrice)
										: `${(walletBalance ?? 0).toLocaleString()} VOI`}</Button
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
		</section>
		<section
			bind:this={costSection}
			aria-label={epochCalc ? 'Cost and price' : 'Price'}
			tabindex="-1"
			class="min-w-0 space-y-4 focus:outline-none"
		>
			<h2 class="text-h2">{epochCalc ? 'Cost and price' : 'Price'}</h2>
			<div class="space-y-6">
				{#if priceSource.error && !useCustomPrice}<InlineAlert
						message="Market price unavailable. VOI estimates remain available."
						onretry={retryKeepingFocus(
							() => costSection,
							() => void priceReader.load(walletAddress ?? '', true)
						)}
					/>{/if}
				{#if epochCalc}<EpochNodeCost bind:cost={nodeCost} />{/if}
				<div
					class="space-y-3 {epochCalc || (priceSource.error && !useCustomPrice)
						? 'border-t border-line pt-4'
						: ''}"
				>
					<div class="flex flex-wrap items-center gap-2">
						{#if useCustomPrice}
							<label for="custom-price" class="text-label text-ink-muted">Your price</label>
						{:else}<span class="text-label text-ink-muted">{shownPriceLabel}</span>{/if}
						{#if !useCustomPrice && !priceSource.error && Number.isFinite(priceSource.value) && (priceSource.value ?? 0) > 0}<strong
								class="text-accent">{formatUSD(priceSource.value ?? 0, 6)}</strong
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
							aria-invalid={Boolean(priceError)}
							aria-describedby={priceError ? 'custom-price-error' : undefined}
							class="block w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-3 py-2 text-ink"
						/>
						{#if priceError}<p id="custom-price-error" role="alert" class="text-label text-danger">
								{priceError}
							</p>{/if}
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
								onclick={() => void priceReader.load(walletAddress ?? '', true)}
								>↻ Refresh price</Button
							>{/if}
					</div>
					{#if hasPrice}<p class="text-label text-ink-muted">
							{useCustomPrice
								? 'USD estimates use your price'
								: 'USD estimates use the market price'}
						</p>{/if}
				</div>
			</div>
		</section>
	</div>

	{#if epochCalc}<EpochEstimate
			calc={epochCalc}
			{calculationAmount}
			{effectivePrice}
			{nodeCost}
			{stakeError}
			{priceError}
			onusestake={setFixedAmount}
		/>{/if}
	<CalculatorBlockRewards
		stake={stakeError ? null : Number(calculationAmount)}
		price={hasPrice ? effectivePrice : null}
	/>
	{#if !epochCalc}<CalculatorDisclaimer wording="block" />{/if}

	{#if epochCalc}<EpochSchedule calc={epochCalc} />{/if}

	<div class="flex flex-wrap gap-x-6 gap-y-3 text-label">
		<a href="/how_to_node#guides" class="text-accent underline underline-offset-4"
			>Browse node guides</a
		>
		<a href="/how_to_node#wallet-check" class="text-accent underline underline-offset-4"
			>Check your node is working</a
		>
	</div>
</div>
