<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import Card from '../Card/Card.svelte';
	import Button from '../Button/Button.svelte';
	import DataTable from '../DataTable/DataTable.svelte';
	import ChartFrame from '../ChartFrame/ChartFrame.svelte';
	import StatusPill from '../StatusPill/StatusPill.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import BarsVsExpected from '../charts/BarsVsExpected.svelte';
	import LineChart from '../charts/LineChart.svelte';
	import StatTile from '../StatTile/StatTile.svelte';
	import BlockRewardsPausedAlert from '../BlockRewardsPausedAlert/BlockRewardsPausedAlert.svelte';
	import { comma, compact, MISSING, pct, shortAddr } from '../format';
	import type { Column } from '../DataTable/types';
	import type { DataState } from '../types';
	import { annotationsFor } from '$lib/data/chartEvents';
	import { epochRange } from '$lib/epochs';
	import { createReadSource } from '$lib/wallet/read';
	import {
		createRewardsState,
		loadRewardEpochs,
		loadPayouts,
		loadDailyProposals,
		loadRewardAccount,
		loadEligibleStakes,
		loadDailyStake,
		loadRewardSupply,
		mergeRewardRows,
		dailyProposals,
		cumulativePayouts,
		recordedPayouts,
		type RewardRow,
		type RewardsState
	} from '$lib/wallet/rewards';
	import {
		BLOCK_REWARD_LAG_ALERT_ROUNDS,
		loadBlockRewardFunding,
		loadBlockRewards,
		loadBlockRewardsDaily,
		loadBlockRewardStatus,
		loadNetworkBlockRewardsDaily,
		mimirLagRounds,
		type BlockReward
	} from '$lib/wallet/blockRewards';
	import {
		blockRewardCount,
		createBlockRewardPager,
		createBlockRewardsState,
		emptyBlockRewardPages,
		historyTotals,
		lagMinutes,
		mergeBlockRewards,
		morePagesAvailable,
		nextRewardStep,
		weekForecastText,
		BLOCK_REWARD_ROWS_SHOWN,
		BLOCK_REWARD_ROWS_STEP,
		type BlockRewardsState
	} from '$lib/wallet/blockRewardsCard';
	import { readLastRound, readOnlineStake } from '$lib/rewards/blockRewardChain';
	import {
		FORECAST_ASSUMPTIONS,
		FORECAST_PERIOD_SECONDS,
		forecastBlockRewards,
		networkPace
	} from '$lib/rewards/blockRewardForecast';
	import {
		BLOCK_REWARD_LOOKBACK_NOTE,
		BLOCK_REWARDS_UNKNOWN_TEXT
	} from '$lib/rewards/blockRewardStatus';
	import {
		BLOCK_REWARD_MAX_MICROVOI,
		BLOCK_REWARD_MIN_MICROVOI,
		FEE_SHARE_PERCENT
	} from '$lib/rewards/blockRewardConstants';
	let {
		pageAddress,
		isContract = false,
		now
	}: { pageAddress: string; isContract?: boolean; now?: Date } = $props();
	let clock = $state(new Date());
	let at = $derived(now ?? clock);
	let sources = $state(createRewardsState());
	const readers = {
		epochs: createReadSource(loadRewardEpochs, (result) => (sources.epochs = result)),
		payouts: createReadSource(loadPayouts, (result) => (sources.payouts = result)),
		daily: createReadSource(loadDailyProposals, (result) => (sources.daily = result)),
		account: createReadSource(loadRewardAccount, (result) => (sources.account = result)),
		eligible: createReadSource(loadEligibleStakes, (result) => (sources.eligible = result)),
		dailyStake: createReadSource(loadDailyStake, (result) => (sources.dailyStake = result)),
		supply: createReadSource(loadRewardSupply, (result) => (sources.supply = result))
	};
	function retry(source: keyof RewardsState) {
		return readers[source].load(pageAddress, true);
	}
	function refresh(address = pageAddress) {
		for (const reader of Object.values(readers)) void reader.load(address, true);
	}
	$effect(() => {
		const address = pageAddress;
		untrack(() => {
			for (const reader of Object.values(readers)) void reader.load(address);
		});
		return () => {
			for (const reader of Object.values(readers)) reader.dispose();
		};
	});
	let blockSources = $state(createBlockRewardsState());
	let pages = $state(emptyBlockRewardPages());
	const pager = createBlockRewardPager((next) => (pages = next));
	const blockReaders = {
		status: createReadSource(
			(address, force) => loadBlockRewardStatus(address, { isContract, force }),
			(result) => (blockSources.status = result)
		),
		funding: createReadSource(
			() => loadBlockRewardFunding(),
			(result) => (blockSources.funding = result)
		),
		daily: createReadSource(
			(address, force) => loadBlockRewardsDaily(address, 30, force),
			(result) => (blockSources.daily = result)
		),
		network: createReadSource(
			(_, force) => loadNetworkBlockRewardsDaily(30, force),
			(result) => (blockSources.network = result)
		),
		onlineStake: createReadSource(
			() => readOnlineStake(),
			(result) => (blockSources.onlineStake = result)
		),
		lastRound: createReadSource(
			() => readLastRound(),
			(result) => (blockSources.lastRound = result)
		),
		recent: createReadSource(
			(address, force) => loadBlockRewards(address, Number.MAX_SAFE_INTEGER, force),
			(result) => (blockSources.recent = result)
		)
	};
	let visibleCount = $state(BLOCK_REWARD_ROWS_SHOWN);
	let pageResets = 0;
	function resetPages(address: string) {
		pageResets++;
		pager.reset(address);
		visibleCount = BLOCK_REWARD_ROWS_SHOWN;
	}
	function retryBlock(source: keyof BlockRewardsState) {
		if (source === 'recent') resetPages(pageAddress);
		return blockReaders[source].load(pageAddress, true);
	}
	function refreshBlock(address = pageAddress) {
		resetPages(address);
		for (const reader of Object.values(blockReaders)) void reader.load(address, true);
	}
	$effect(() => {
		const address = pageAddress;
		void isContract;
		untrack(() => {
			resetPages(address);
			for (const reader of Object.values(blockReaders)) void reader.load(address);
		});
		return () => {
			pager.dispose();
			for (const reader of Object.values(blockReaders)) reader.dispose();
		};
	});
	onMount(() => {
		const timer = setInterval(() => (clock = new Date()), 30000);
		return () => clearInterval(timer);
	});
	let rows = $derived(
		mergeRewardRows(
			sources.epochs.value ?? [],
			sources.payouts,
			at.getTime(),
			sources.account.value,
			sources.eligible.value,
			sources.supply.value
		)
	);
	let days = $derived(
		dailyProposals(
			sources.daily.value ?? {},
			sources.account.value ? sources.account.value.balance * 1e6 : null,
			sources.dailyStake.value ?? [],
			at
		)
	);
	let expectedMissing = $derived(
		!sources.account.value ||
			!sources.dailyStake.value ||
			days.some((day) => day.actual !== null && day.expected === null)
	);
	let recorded = $derived(sources.payouts.value ? recordedPayouts(sources.payouts.value) : []);
	let cumulative = $derived(sources.payouts.value ? cumulativePayouts(sources.payouts.value) : []);
	let dailyData = $derived({
		columns: ['UTC date', 'Produced blocks', 'Expected approximation', 'State'],
		rows: days.map((day) => [
			day.date,
			day.actual ?? 'Unavailable',
			day.expected ?? 'Unavailable',
			day.current ? 'In progress' : 'Complete'
		]),
		caption:
			'Proposals API; expected = current account balance / daily average online stake × (86400 / 2.8). Omitted dates are unavailable, not zero.'
	});
	let payoutData = $derived({
		columns: ['UTC receipt', 'Transaction ID', 'Amount VOI', 'Running VOI'],
		rows: recorded.map((payment) => [
			payment.timestamp,
			payment.txid,
			payment.amount,
			payment.running
		]),
		caption:
			sources.payouts.value?.complete === false
				? 'Known recorded payments subtotal; incomplete. Line withheld until Retry succeeds.'
				: 'Cumulative recorded payments; missing or unreturned payments are not included. Source: get_account_transactions_multi.'
	});
	let dailyMax = $derived(
		Math.max(1, ...days.flatMap((day) => [day.actual ?? 0, day.expected ?? 0])) * 1.2
	);
	let payoutMax = $derived(Math.max(1, ...cumulative.map((payment) => payment.running)) * 1.1);
	function amount(value: number | null) {
		return value === null
			? 'Unavailable'
			: value > 0 && value < 0.01
				? '<0.01 VOI'
				: `${compact(value, 2)} VOI`;
	}
	let columns: Column<RewardRow>[] = $derived([
		{
			key: 'epoch',
			header: 'Epoch',
			priority: 1,
			numeric: true,
			sortable: true,
			sortValue: (row) => row.epoch
		},
		{
			key: 'blocks',
			header: 'Blocks / Expected',
			priority: 2,
			numeric: true,
			sortable: true,
			sortValue: (row) => row.blocks,
			cell: blocksCell
		},
		{
			key: 'ratio',
			header: 'Luck',
			priority: 3,
			numeric: true,
			sortable: true,
			sortValue: (row) => row.ratio,
			cell: luckCell
		},
		{
			key: 'estimate',
			header: 'Est. reward',
			priority: 2,
			numeric: true,
			sortable: true,
			sortValue: (row) => row.estimate,
			cell: estimateCell
		},
		{
			key: 'actual',
			header: 'Actual payout',
			priority: 1,
			numeric: true,
			sortable: true,
			sortValue: (row) => row.actual,
			cell: payoutCell
		},
		{
			key: 'status',
			header: 'Status',
			priority: 1,
			sortable: true,
			sortValue: (row) => row.status,
			cell: statusCell
		}
	]);
	let blockStatus = $derived(blockSources.status.value);
	let funding = $derived(blockSources.funding.value);
	let fundingPaused = $derived(funding?.funding === 'paused');
	let fundingUnknown = $derived(
		blockSources.funding.state === 'error' || funding?.funding === 'unknown'
	);
	// Pace is judged at the time the network rows were read, so the clock passing UTC
	// midnight does not leave the new day looking unindexed.
	let pace = $derived(
		blockSources.network.value
			? networkPace(blockSources.network.value, new Date(blockSources.network.asOf))
			: null
	);
	let lag = $derived(
		blockSources.network.value && blockSources.lastRound.value !== undefined
			? mimirLagRounds(blockSources.lastRound.value, blockSources.network.value)
			: null
	);
	let totals = $derived(historyTotals(blockSources.daily.value ?? [], at));
	let historyState: DataState = $derived(
		blockSources.daily.state === 'empty' ? 'ready' : blockSources.daily.state
	);
	function forecastFor(seconds: number) {
		const onlineStake = blockSources.onlineStake.value;
		const round = blockSources.lastRound.value;
		const bonus = funding?.bonus;
		if (!blockStatus || onlineStake === undefined || round === undefined || bonus == null || !pace)
			return null;
		return forecastBlockRewards({
			stake: blockStatus.balance,
			onlineStake,
			blockTime: pace.blockTime,
			avgFees: pace.avgFees,
			bonus,
			round,
			seconds,
			eligible: blockStatus.registered
		});
	}
	let dayForecast = $derived(forecastFor(FORECAST_PERIOD_SECONDS.day));
	let weekForecast = $derived(forecastFor(FORECAST_PERIOD_SECONDS.week));
	const forecastSources = ['status', 'funding', 'network', 'onlineStake', 'lastRound'] as const;
	let notRegistered = $derived(blockStatus?.registered === false);
	let forecastState: DataState = $derived(
		notRegistered
			? 'ready'
			: forecastSources.some((key) => blockSources[key].state === 'loading')
				? 'loading'
				: dayForecast && weekForecast
					? 'ready'
					: 'error'
	);
	function retryForecast() {
		for (const key of forecastSources) void retryBlock(key);
	}
	function chanceText(chance: number) {
		const percent = chance * 100;
		return percent > 99 ? '>99%' : pct(percent, percent < 1 ? 2 : 0);
	}
	let expectedShare = $derived(
		blockStatus?.registered === true &&
			!isContract &&
			blockSources.onlineStake.value !== undefined &&
			blockStatus.balance >= BLOCK_REWARD_MIN_MICROVOI &&
			blockStatus.balance <= BLOCK_REWARD_MAX_MICROVOI
			? blockStatus.balance / blockSources.onlineStake.value
			: null
	);
	let networkBlocks = $derived(
		new Map((blockSources.network.value ?? []).map((row) => [row.day, row.blocks]))
	);
	let blockDays = $derived(
		[...(blockSources.daily.value ?? [])]
			.sort((a, b) => a.day.localeCompare(b.day))
			.map((row) => {
				const blocks = networkBlocks.get(row.day);
				return {
					...row,
					expected: expectedShare === null || blocks === undefined ? null : expectedShare * blocks
				};
			})
	);
	let blockChartData = $derived({
		columns: ['UTC date', 'Block rewards', 'Expected at current balance', 'VOI'],
		rows: blockDays.map((day) => [
			day.day,
			day.count,
			day.expected === null ? 'Unavailable' : comma(day.expected, 2),
			comma(day.amount / 1e6, 6)
		]),
		caption:
			"Mimir indexed blocks; expected = current balance / current online stake × that day's network blocks."
	});
	let blockMax = $derived(
		Math.max(1, ...blockDays.flatMap((day) => [day.count, day.expected ?? 0])) * 1.2
	);
	let recentRows = $derived(mergeBlockRewards(blockSources.recent.value ?? [], pages.extra));
	let nextStep = $derived(
		nextRewardStep(
			recentRows.length,
			visibleCount,
			blockSources.recent.value !== undefined &&
				morePagesAvailable(blockSources.recent.value, pages)
		)
	);
	// Only off a settled first page: paging from a page being refreshed could mix two reads.
	let showMore = $derived(
		blockSources.recent.state === 'ready' && pages.state !== 'error' && nextStep !== null
	);
	let shownRecent = $derived(recentRows.slice(0, visibleCount));
	async function showMoreRewards() {
		if (pages.state === 'loading' || nextStep === null) return;
		const address = pageAddress;
		const resets = pageResets;
		const before = shownRecent.length;
		if (nextStep === 'fetch') {
			await pager.more(recentRows);
			// A refresh or address change during the fetch already reset the rows shown.
			if (resets !== pageResets || address !== pageAddress || pages.state === 'error') return;
		}
		visibleCount = Math.min(before + BLOCK_REWARD_ROWS_STEP, recentRows.length);
		const revealed = recentRows[before];
		await tick();
		if (showMore || !revealed || address !== pageAddress) return;
		document
			.querySelector<HTMLElement>(`[data-block-reward-tx="${CSS.escape(revealed.txid)}"]`)
			?.focus();
	}
	const fixableReasons = new Set(['suspended', 'not-opted-in', 'offline', 'keys-expired']);
	let canGoOnline = $derived(
		!isContract && !!blockStatus?.reasons.some((reason) => fixableReasons.has(reason.code))
	);
	const microVoi = (micro: number) => comma(micro / 1e6, 6);
	let blockColumns: Column<BlockReward>[] = $derived([
		{ key: 'time', header: 'UTC time', priority: 1, cell: timeCell },
		{ key: 'round', header: 'Round', priority: 2, numeric: true, cell: roundCell },
		{ key: 'amount', header: 'VOI', priority: 1, numeric: true, cell: amountCell },
		{ key: 'bonus', header: 'Bonus', priority: 3, numeric: true, cell: bonusCell },
		{ key: 'feeShare', header: 'Fee share', priority: 3, numeric: true, cell: feeShareCell },
		{ key: 'note', header: 'Note', priority: 2, cell: noteCell },
		{ key: 'txid', header: 'Transaction', priority: 1, cell: txCell }
	]);
</script>

{#snippet timeCell(row: BlockReward)}{row.time.slice(0, 19).replace('T', ' ')}{/snippet}
{#snippet roundCell(row: BlockReward)}{comma(row.round)}{/snippet}
{#snippet amountCell(row: BlockReward)}{microVoi(row.amount)}{/snippet}
{#snippet bonusCell(row: BlockReward)}{microVoi(row.bonus)}{/snippet}
{#snippet feeShareCell(row: BlockReward)}{microVoi(
		Math.floor((row.feesCollected * FEE_SHARE_PERCENT) / 100)
	)}{/snippet}
{#snippet noteCell(row: BlockReward)}{#if row.partial}Partial (fee sink low){:else}<span
			class="text-ink-muted">—</span
		>{/if}{/snippet}
{#snippet txCell(row: BlockReward)}<a
		class="break-all text-accent underline"
		href={`https://block.voi.network/explorer/transaction/${encodeURIComponent(row.txid)}`}
		target="_blank"
		rel="noopener noreferrer"
		title={row.txid}
		data-block-reward-tx={row.txid}
		>{shortAddr(row.txid)}<span class="sr-only"> (opens in a new tab)</span></a
	>{/snippet}
{#snippet warning(source: keyof RewardsState, message: string)}
	{#if sources[source].state === 'error' || sources[source].error}
		<InlineAlert
			{message}
			tone={sources[source].value !== undefined ? 'warn' : 'danger'}
			onretry={() => void retry(source)}
		/>
	{/if}
	{#if sources[source].state === 'stale'}<p class="text-label text-warn">
			As of {new Date(sources[source].asOf!).toUTCString()}{sources[source].error
				? ' · Refresh failed'
				: ''}
		</p>{/if}
{/snippet}
{#snippet blocksCell(row: RewardRow)}<span
		title={`${row.blocks} / ${row.expected ?? 'Unavailable'}`}
		>{comma(row.blocks)} / {row.expected === null ? 'Unavailable' : comma(row.expected, 1)}</span
	>{/snippet}
{#snippet luckCell(row: RewardRow)}{row.ratio === null
		? 'Unavailable'
		: pct(row.ratio * 100)}{/snippet}
{#snippet estimateCell(row: RewardRow)}<span title={String(row.estimate ?? 'Unavailable')}
		>{row.tooEarly ? 'Too early to project' : amount(row.estimate)}</span
	>{/snippet}
{#snippet payoutCell(row: RewardRow)}
	<span
		class="break-words"
		title={row.actual === null ? row.explanation || row.payoutText : `${row.actual} VOI`}
		>{row.actual === null ? row.payoutText : amount(row.actual)}</span
	>
{/snippet}
{#snippet statusCell(row: RewardRow)}{#if row.status}<StatusPill
			tone={row.tone}
			label={row.status}
		/>{:else}<span class="text-ink-muted">—</span>{/if}{/snippet}
{#snippet detail(row: RewardRow)}
	<div class="space-y-2 break-words text-label">
		<p>{epochRange(row.epoch).label} (UTC)</p>
		<p>
			Produced: {comma(row.blocks)} · Expected: {row.expected === null
				? 'Unavailable'
				: comma(row.expected, 2)} · Luck: {row.ratio === null
				? 'Unavailable'
				: pct(row.ratio * 100)}
		</p>
		<p title={String(row.estimate ?? 'Unavailable')}>
			Estimated reward: {row.tooEarly ? 'Too early to project' : amount(row.estimate)} · Payout: {row.actual ===
			null
				? row.payoutText
				: `${comma(row.actual, 2)} VOI`}
		</p>
		{#if row.explanation}<p>{row.explanation}</p>{/if}
		{#if row.blocks > 0}<p>
				Matched by receipt date in the following week: {epochRange(
					row.epoch + 1
				).start.toISOString()} inclusive to {epochRange(row.epoch + 2).start.toISOString()} exclusive.
			</p>{/if}
		{#each row.payments as payment (payment.txid)}
			<a
				class="block break-all text-accent underline"
				href={`https://block.voi.network/explorer/transaction/${encodeURIComponent(payment.txid)}`}
				target="_blank"
				rel="noopener noreferrer"
				>{payment.txid} · {payment.amount} VOI<span class="sr-only"> (opens in a new tab)</span></a
			>
		{/each}
	</div>
{/snippet}

<div class="min-w-0 space-y-5 [overflow-wrap:anywhere]">
	<Card title="Rewards by epoch">
		{#snippet actions()}<Button variant="soft" onclick={() => refresh()}>Refresh rewards</Button
			>{/snippet}
		<p class="mb-3 text-label text-ink-muted">
			Rewards received by {shortAddr(pageAddress)}. Open a contract to see its rewards.
		</p>
		<p class="mb-3 text-label text-ink-muted">
			Expected using current online balance; historical account stake is unavailable.
		</p>
		{@render warning('epochs', 'Reward history unavailable')}
		{@render warning('payouts', 'Recorded payouts unavailable')}
		{@render warning('account', 'Current account balance unavailable')}
		{@render warning('eligible', 'Historical eligible stake unavailable')}
		{@render warning('supply', 'Current eligible stake unavailable')}
		{#if sources.payouts.value?.complete === false}<InlineAlert
				tone="warn"
				message="Recorded payouts incomplete. Payout attribution unavailable."
				onretry={() => void retry('payouts')}
			/>{/if}
		{#if sources.epochs.state === 'loading'}
			<div aria-busy="true" class="space-y-3">
				<p class="sr-only">Loading rewards by epoch…</p>
				{#each Array.from({ length: 8 }, (_, index) => index) as index (index)}<div
						class="h-9 rounded-ds-xs bg-grid"
					></div>{/each}
			</div>
		{:else}
			<DataTable
				{columns}
				{rows}
				rowKey={(row) => String(row.epoch)}
				rowName={(row) => `epoch ${row.epoch}`}
				caption={`Rewards by epoch for ${pageAddress}; estimates and payouts in VOI`}
				id="wallet-reward-epochs"
				density="compact"
				sort={{ key: 'epoch', dir: 'desc' }}
				limit={15}
				moreLabel={(hidden) => `See ${hidden} more epochs`}
				expandable
				{detail}
				state={sources.epochs.state}
				asOf={sources.epochs.asOf}
				onretry={() => void retry('epochs')}
				emptyText="No reward history returned for this address"
			/>
		{/if}
	</Card>
	<div class="grid min-w-0 gap-bento lg:grid-cols-12">
		<div class="min-w-0 space-y-3 lg:col-span-8">
			{@render warning('daily', 'Daily proposals unavailable')}
			{@render warning('dailyStake', 'Expected proposals unavailable')}
			{#if expectedMissing && sources.dailyStake.state !== 'error'}<InlineAlert
					tone="warn"
					message="Expected proposals unavailable. Actual blocks remain visible."
					onretry={() => {
						if (!sources.account.value) void retry('account');
						void retry('dailyStake');
					}}
				/>{/if}
			{#if sources.daily.value && Object.keys(sources.daily.value).length === 0}<p
					class="text-label text-ink-muted"
				>
					No proposals returned in the last 30 days
				</p>{/if}
			<ChartFrame
				title="Daily proposals · last 30 days"
				summary="Daily produced blocks and expected approximation for this address, UTC"
				data={dailyData}
				state={sources.daily.state === 'ready' && Object.keys(sources.daily.value).length === 0
					? 'empty'
					: sources.daily.state}
				onretry={() => void retry('daily')}
				asOf={sources.daily.asOf}
				x={{ kind: 'band', values: days.map((day) => day.date) }}
				y={{ domain: [0, dailyMax] }}
				legend={days.some((day) => day.expected !== null)
					? [
							{ label: 'Produced blocks', swatch: 'fill' },
							{ label: 'Expected approximation', swatch: 'expected' },
							{ label: 'Above expected', swatch: 'hi' }
						]
					: [{ label: 'Produced blocks', swatch: 'fill' }]}
				annotations={annotationsFor('blocksVsExpected', 'date')}
				describe={(index) => dailyData.rows[index].join(' · ')}
				height={240}
			>
				{#snippet children(ctx)}<BarsVsExpected
						{ctx}
						bars={days.map((day) => ({
							x: day.date,
							value: day.actual ?? NaN,
							expected: day.expected ?? NaN
						}))}
					/>{/snippet}
			</ChartFrame>
		</div>
		<div class="min-w-0 space-y-3 lg:col-span-4">
			{#if sources.payouts.value?.complete && !recorded.length}<p class="text-label text-ink-muted">
					No recorded payouts returned.
				</p>{/if}
			<ChartFrame
				title="Recorded payouts"
				summary="Cumulative recorded VOI payments, matched rewards senders and this recipient"
				data={payoutData}
				state={sources.payouts.value?.complete === false
					? 'error'
					: sources.payouts.value && !recorded.length
						? 'empty'
						: sources.payouts.state}
				onretry={() => void retry('payouts')}
				asOf={sources.payouts.asOf}
				x={{
					kind: 'time',
					domain: [
						new Date(recorded[0]?.timestamp ?? at.getTime() - 86400000),
						new Date(Math.max(at.getTime(), Date.parse(recorded.at(-1)?.timestamp ?? '') || 0))
					]
				}}
				y={{ domain: [0, payoutMax] }}
				height={240}
			>
				{#snippet children(ctx)}<LineChart
						{ctx}
						points={cumulative.map((payment) => ({
							x: new Date(payment.timestamp),
							y: payment.running
						}))}
						area={false}
						tone="accent"
					/>{/snippet}
			</ChartFrame>
		</div>
	</div>
	<Card title="Block rewards">
		{#snippet actions()}<Button variant="soft" onclick={() => refreshBlock()}
				>Refresh block rewards</Button
			>{/snippet}
		<div class="min-w-0 space-y-4">
			<div class="space-y-2">
				{#if blockStatus}
					{#if blockStatus.registered}
						<StatusPill tone="ok" label="Registered for block rewards" />
					{:else}
						<StatusPill tone="warn" label="Not registered for block rewards" />
						<ul class="space-y-1 text-sm">
							{#each blockStatus.reasons as reason (reason.code)}<li>{reason.text}</li>{/each}
						</ul>
						{#if canGoOnline}<a class="text-sm text-accent underline" href="#overview"
								>Go online with the 2 VOI incentive fee</a
							>{/if}
					{/if}
					<p class="text-label text-ink-muted">{BLOCK_REWARD_LOOKBACK_NOTE}</p>
				{:else if blockSources.status.state === 'error'}
					<InlineAlert
						message="Block reward registration status unavailable"
						onretry={() => void retryBlock('status')}
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
					onretry={() => void retryBlock('funding')}
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
				{#each [{ label: 'Today (UTC)', total: totals.today }, { label: 'Last 7 days', total: totals.week }, { label: 'Last 30 days', total: totals.month }] as item (item.label)}
					<StatTile
						label={item.label}
						value={amount(item.total.amount / 1e6)}
						detail={blockRewardCount(item.total.count)}
						state={historyState}
						asOf={blockSources.daily.asOf}
						onretry={() => void retryBlock('daily')}
					/>
				{/each}
			</div>
			<div class="space-y-2">
				<div class="grid min-w-0 gap-3 sm:grid-cols-2">
					<StatTile
						label="Chance of a block reward · next 24 hours"
						value={notRegistered
							? 'Not registered'
							: dayForecast
								? chanceText(dayForecast.chance)
								: MISSING}
						state={forecastState}
						onretry={retryForecast}
					/>
					<StatTile
						label="Next 7 days"
						value={notRegistered
							? 'Not registered'
							: weekForecast
								? weekForecastText(weekForecast)
								: MISSING}
						state={forecastState}
						onretry={retryForecast}
					/>
				</div>
				<p class="text-label text-ink-muted">
					{FORECAST_ASSUMPTIONS}{fundingPaused ? ' Forecasts show rewards while funded.' : ''}
				</p>
			</div>
			{#if blockSources.daily.state === 'empty'}<p class="text-label text-ink-muted">
					No block rewards returned in the last 30 days
				</p>{/if}
			<ChartFrame
				title="Daily block rewards · last 30 days"
				headingLevel={3}
				summary="Daily block rewards and expected block rewards at the current balance for this address, UTC"
				data={blockChartData}
				state={blockSources.daily.state}
				onretry={() => void retryBlock('daily')}
				asOf={blockSources.daily.asOf}
				x={{ kind: 'band', values: blockDays.map((day) => day.day) }}
				y={{ domain: [0, blockMax] }}
				legend={blockDays.some((day) => day.expected !== null)
					? [
							{ label: 'Block rewards', swatch: 'fill' },
							{ label: 'Expected at current balance', swatch: 'expected' },
							{ label: 'Above expected', swatch: 'hi' }
						]
					: [{ label: 'Block rewards', swatch: 'fill' }]}
				describe={(index) => blockChartData.rows[index].join(' · ')}
				height={240}
			>
				{#snippet children(ctx)}<BarsVsExpected
						{ctx}
						bars={blockDays.map((day) => ({
							x: day.day,
							value: day.count,
							expected: day.expected ?? NaN
						}))}
					/>{/snippet}
			</ChartFrame>
			<div class="min-w-0 space-y-3">
				<h3 class="text-sm font-bold">Recent block rewards</h3>
				<DataTable
					columns={blockColumns}
					rows={shownRecent}
					rowKey={(row) => row.txid}
					rowName={(row) => `round ${row.round}`}
					caption={`Recent block rewards for ${pageAddress}; amounts in VOI, newest first`}
					captionHidden
					id="wallet-block-rewards"
					density="compact"
					expandable
					state={blockSources.recent.state}
					asOf={blockSources.recent.asOf}
					onretry={() => void retryBlock('recent')}
					emptyText="No block rewards returned for this address"
				/>
				{#if pages.state === 'error'}<InlineAlert
						tone="warn"
						message="Older block rewards unavailable"
						onretry={() => void showMoreRewards()}
					/>{/if}
				<p class="sr-only" aria-live="polite">
					{#if recentRows.length}Showing {shownRecent.length} of {recentRows.length} loaded block rewards{/if}
				</p>
				{#if showMore}<Button
						variant="soft"
						aria-busy={pages.state === 'loading' || undefined}
						onclick={() => void showMoreRewards()}
						>{pages.state === 'loading'
							? 'Loading older block rewards…'
							: 'Show more block rewards'}</Button
					>{/if}
			</div>
		</div>
	</Card>
</div>
