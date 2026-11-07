<script lang="ts">
	import type { WalletSummary, WalletContract, WalletEpoch } from '$lib/wallet/summary';
	import type { SelectedAccount } from '$lib/chain/signerGate';
	import type { DataState } from '../types';
	import Card from '../Card/Card.svelte';
	import HealthRing from '../HealthRing/HealthRing.svelte';
	import HealthItem from '../HealthItem/HealthItem.svelte';
	import StatusPill from '../StatusPill/StatusPill.svelte';
	import ChartFrame from '../ChartFrame/ChartFrame.svelte';
	import BarsVsExpected from '../charts/BarsVsExpected.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import Chip from '../Chip/Chip.svelte';
	import WalletContracts from '../WalletContracts/WalletContracts.svelte';
	import { annotationsFor } from '$lib/data/chartEvents';
	import { ago, comma, compact, pct, usd } from '../format';

	let {
		summary,
		contracts,
		current,
		historyState = 'loading',
		price = null,
		pageAddress,
		selected,
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
		selected: SelectedAccount;
		asOf?: string;
		now: number;
		onrefresh?: () => Promise<void> | void;
	} = $props();
	const loading = $derived(summary.state === 'loading');
	const failed = $derived(summary.state === 'error');
	const stakingUnavailable = $derived(summary.contractSet === 'unavailable');
	const bars = $derived(
		summary.history.map((epoch) => ({
			x: epoch.epoch,
			value: epoch.blocks ?? NaN,
			expected: epoch.expected ?? NaN
		}))
	);
	const chartState = $derived(
		loading
			? 'loading'
			: failed || stakingUnavailable
				? 'error'
				: historyState === 'error'
					? 'error'
					: summary.history.length
						? summary.state
						: 'empty'
	);
	const date = (value: string | number) =>
		new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(value));
	const maxYear = $derived(Math.max(1, ...summary.lockedByYear.map((year) => year.amount)));
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
	<Card title="Node health" span={{ lg: 5 }} actions={healthStatus}>
		{#if !loading && (failed || stakingUnavailable)}<InlineAlert
				message="Node health unavailable."
				onretry={onrefresh}
			/>
		{:else}
			<div class="flex flex-wrap items-center gap-5">
				<HealthRing
					value={summary.onlineContracts}
					total={summary.contractCount}
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
							tone={summary.voteTone}
							title={summary.oldestVoteAt
								? `Voted ${ago(summary.oldestVoteAt, now)}`
								: 'Last vote unavailable'}
							detail={`Oldest vote among online accounts · last block ${summary.lastBlock === null ? 'unavailable' : `${summary.lastBlockAt ? ago(summary.lastBlockAt, now) + ' · ' : ''}#${comma(summary.lastBlock)}`}`}
						/>
						<HealthItem
							tone={summary.idleCount ? 'warn' : 'ok'}
							title={`${comma(summary.idleCount)} contracts not staking`}
							detail={`${compact(summary.idleBalance, 1)} VOI idle`}
						/>
					</ul>
				{/if}
			</div>
		{/if}
	</Card>
	<Card title="This epoch so far" variant="hero" span={{ lg: 7 }}>
		{#if loading}
			<div aria-busy="true" class="space-y-4 py-3">
				<span class="sr-only">Loading this epoch…</span>
				<div aria-hidden="true" class="h-14 rounded bg-on-hero-surface"></div>
				<div aria-hidden="true" class="h-6 rounded bg-on-hero-surface"></div>
			</div>
		{:else if failed || stakingUnavailable}<InlineAlert
				message="This epoch unavailable. Earned rewards and luck unavailable."
				onretry={onrefresh}
			/>
		{:else}
			<p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<strong class="text-hero-num" title={String(summary.current.reward ?? '')}
					>{summary.current.reward === null ? '—' : `≈ ${compact(summary.current.reward, 1)}`}
					<span class="text-h2">VOI</span></strong
				>
				<span class="text-on-hero-muted"
					>{summary.current.reward !== null && price !== null
						? usd(summary.current.reward * price)
						: 'USD unavailable'}</span
				>
			</p>
			<p class="mt-2 text-sm text-on-hero-muted">
				{comma(summary.current.blocks)} blocks · {pct(
					summary.current.share === null ? null : summary.current.share * 100
				)} of the network · {pct(
					summary.current.ratio === null ? null : summary.current.ratio * 100,
					0
				)} of expected
			</p>
			{#if summary.tooEarly}<p class="mt-2 text-label">
					Too early to project rewards: fewer than 50 expected blocks.
				</p>{/if}
			<div
				class="my-4 h-2 rounded-full bg-on-hero-surface"
				role="progressbar"
				aria-label={`Epoch ${summary.current.epoch} elapsed`}
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Math.round(summary.current.progress * 100)}
			>
				<div
					class="h-full rounded-full bg-on-hero"
					style:width={`${summary.current.progress * 100}%`}
				></div>
			</div>
			<dl class="grid grid-cols-2 gap-4 text-label sm:grid-cols-3">
				<div>
					<dt class="text-on-hero-muted">Staked online</dt>
					<dd class="text-h2">{compact(summary.stakedOnline)} VOI</dd>
				</div>
				<div>
					<dt class="text-on-hero-muted">Earned, {summary.history.length || 12} epochs</dt>
					<dd class="text-h2">
						{historyState === 'error' ? 'Unavailable' : `≈ ${compact(summary.earnedHistory)} VOI`}
					</dd>
				</div>
				<div>
					<dt class="text-on-hero-muted">{summary.history.length || 12}-epoch luck</dt>
					<dd class="text-h2">
						{historyState === 'error'
							? 'Unavailable'
							: pct(summary.historyRatio === null ? null : summary.historyRatio * 100, 0)}
					</dd>
				</div>
			</dl>
			<details class="mt-4 text-label">
				<summary class="cursor-pointer">View current epoch data</summary>
				<dl class="mt-2 grid grid-cols-1 gap-2">
					<div>
						<dt>Produced · live epoch rows</dt>
						<dd>{comma(summary.current.blocks)} blocks</dd>
					</div>
					<div>
						<dt>
							Expected · live network blocks × algod online balance ÷ eligible stake (algod supply
							minus excluded stake)
						</dt>
						<dd>
							{comma(summary.current.expected, 2)} blocks = {comma(current?.networkBlocks)} × {comma(
								summary.stakedOnline,
								6
							)} ÷ {comma(current?.onlineStake, 6)}
						</dd>
					</div>
					<div>
						<dt>Reward estimate · epoch pool ÷ projected network blocks × produced</dt>
						<dd>
							{comma(summary.current.reward, 6)} VOI; pool {comma(current?.pool)} VOI. This is an estimate,
							not a payout.
						</dd>
					</div>
				</dl>
			</details>
		{/if}
	</Card>
	<div class="min-w-0 lg:col-span-8">
		<ChartFrame
			title="Blocks vs expected"
			summary="Blocks produced and expected over the last 12 complete epochs. Expected uses current online balances as an approximation of historical stake."
			state={chartState}
			{asOf}
			onretry={onrefresh}
			legend={[
				{ label: 'Produced', swatch: 'fill' },
				{ label: '>115% of expected', swatch: 'hi' },
				{ label: 'Expected', swatch: 'expected' }
			]}
			annotations={annotationsFor('blocksVsExpected', 'epoch')}
			x={{ kind: 'band', values: bars.map((bar) => bar.x) }}
			y={{
				domain: [
					0,
					Math.max(
						1,
						...bars.flatMap((bar) => [bar.value, Number.isFinite(bar.expected) ? bar.expected : 0])
					) * 1.2
				]
			}}
			data={{
				columns: ['Epoch', 'Produced', 'Expected', 'Luck', 'Est. reward (VOI)'],
				rows: summary.history.map((epoch) => [
					epoch.epoch,
					epoch.blocks ?? 'Unavailable',
					epoch.expected ?? 'Unavailable',
					pct(epoch.ratio === null ? null : epoch.ratio * 100),
					epoch.reward ?? 'Unavailable'
				]),
				caption:
					'Produced: proposers API epoch rows. Expected = network blocks × current online balances (algod) ÷ eligible online stake (epoch-detail); historical stake is approximate. Reward = epoch pool (getTokensByEpoch) × block share. Luck = produced ÷ expected. Complete epochs only; the current card uses live rows.'
			}}
		>
			{#snippet children(ctx)}<BarsVsExpected {ctx} {bars} />{/snippet}
		</ChartFrame>
	</div>
	<Card title="Next unlocks" span={{ lg: 4 }}>
		{#if loading}{@render skeleton('next unlocks')}
		{:else if failed || !summary.contractsReady}<InlineAlert
				message="Unlock schedules unavailable."
				onretry={failed || stakingUnavailable ? onrefresh : undefined}
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
	</Card>
	<div class="min-w-0 lg:col-span-8">
		<WalletContracts
			{contracts}
			{current}
			{pageAddress}
			{selected}
			state={loading ? 'loading' : stakingUnavailable ? 'error' : summary.state}
			{asOf}
			{onrefresh}
		/>
	</div>
	<Card title="Holdings" span={{ lg: 4 }}>
		{#if loading}{@render skeleton('holdings')}
		{:else if failed || holdings.state === 'error'}<InlineAlert
				message={summary.contractsReady
					? 'Holdings valuation unavailable.'
					: 'Holdings valuation unavailable. Locked balance unavailable.'}
				onretry={failed || stakingUnavailable || summary.contractsReady ? onrefresh : undefined}
			/>
			{#if !failed && holdings.liquidKnown}<p class="mt-3 text-label">
					Liquid: <strong>{comma(holdings.liquid)} VOI</strong>
				</p>{:else if !failed}<p class="mt-3 text-label">
					Liquid: <strong>Unavailable</strong>
				</p>{/if}
		{:else}
			<p>
				<strong class="text-stat" title={`${holdings.total} VOI`}>{compact(holdings.total)}</strong>
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
		<a href="#holdings" class="mt-4 inline-block font-bold text-accent underline">View holdings →</a
		>
	</Card>
</div>
