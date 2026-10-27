<script lang="ts">
	import {
		Button,
		Header,
		Footer,
		Card,
		Chip,
		CopyButton,
		DataTable,
		EpochStepper,
		MISSING,
		type Column,
		type SortState,
		HealthItem,
		HealthRing,
		InlineAlert,
		Sparkline,
		StatTile,
		StatusPill,
		ThemeToggle,
		ago,
		comma,
		compact,
		pct,
		shortAddr,
		usd
	} from '$lib/ds';
	import {
		aprHistory,
		asOf,
		buttonVariants,
		cardSpans,
		chipTones,
		proposers,
		lockContracts,
		epochRange,
		type Proposer,
		type LockContract,
		network,
		offlineCount,
		onlineCount,
		ringTones,
		sizes,
		sparklineTones,
		states,
		statusLabels,
		syntheticHealth,
		tones,
		wallet
	} from './fixtures';

	let retries = $state(0);
	const retry = () => {
		retries += 1;
	};

	const colours: [string, string][] = [
		['bg-canvas', 'canvas'],
		['bg-surface', 'surface'],
		['bg-surface-2', 'surface-2'],
		['bg-line', 'line'],
		['bg-edge', 'edge'],
		['bg-ink', 'ink'],
		['bg-ink-muted', 'ink-muted'],
		['bg-accent', 'accent'],
		['bg-accent-fill', 'accent-fill'],
		['bg-accent-soft', 'accent-soft'],
		['bg-hi', 'hi'],
		['bg-hi-ink', 'hi-ink'],
		['bg-hi-soft', 'hi-soft'],
		['bg-ok', 'ok'],
		['bg-ok-soft', 'ok-soft'],
		['bg-warn', 'warn'],
		['bg-warn-soft', 'warn-soft'],
		['bg-danger', 'danger'],
		['bg-danger-soft', 'danger-soft'],
		['bg-focus', 'focus'],
		['bg-grid', 'grid'],
		['bg-series-3', 'series-3'],
		['bg-expected', 'expected'],
		['bg-expected-halo', 'expected-halo']
	];

	const type: [string, string][] = [
		['text-display', 'Display 50/34'],
		['text-hero-num', '16.04%'],
		['text-stat', '55.94M'],
		['text-title', 'Title 32/26'],
		['text-lede', 'Lede: the one-sentence answer.'],
		['text-h2', 'Card title (h2)'],
		['text-body', 'Body text at 15px, the default size for paragraphs.'],
		['text-sm', 'Small: table cells and list rows'],
		['text-label', 'Label: tile labels, captions'],
		['text-micro', 'MICRO: TABLE HEADERS, CHIPS']
	];

	const radii = [
		'rounded-ds-xs',
		'rounded-ds-sm',
		'rounded-ds-md',
		'rounded-card',
		'rounded-hero',
		'rounded-full'
	];

	const now = Date.now();
	const numbers: [string, string][] = [
		['compact(139592135.92)', compact(139592135.92)],
		['compact(576123, 1)', compact(576123, 1)],
		['compact(9999)', compact(9999)],
		['comma(2236808)', comma(2236808)],
		['usd(0.004213)', usd(0.004213)],
		['usd(1234.5)', usd(1234.5)],
		['pct(16.039)', pct(16.039)],
		['ago(5 minutes ago)', ago(now - 5 * 60_000, now)],
		['shortAddr(…)', shortAddr('G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ')],
		['compact(null)', compact(null)]
	];

	let favourites = $state<string[]>([]);
	let tableStatus = $state('');
	let proposerSort = $state<SortState>({ key: 'blocks', dir: 'desc' });
	let currentEpoch = $state(104);
	let firstEpoch = $state(1);
	let simpleEpoch = $state(103);
	const proposerName = (row: Proposer) => row.name || shortAddr(row.addr);
	const hiddenContracts = lockContracts.slice(7);
	const hiddenBalance = hiddenContracts.reduce((sum, row) => sum + row.balance, 0);
	const proposerColumns: Column<Proposer>[] = [
		{ key: 'rank', header: 'Rank', priority: 1, numeric: true, width: '2rem' },
		{ key: 'name', header: 'Proposer', priority: 1, cell: proposerLink },
		{
			key: 'blocks',
			header: 'Blocks',
			priority: 1,
			numeric: true,
			sortable: true,
			sortValue: (r) => r.blocks,
			cell: proposerBlocks
		},
		{
			key: 'share',
			header: 'Share',
			priority: 2,
			numeric: true,
			sortable: true,
			sortValue: (r) => r.share,
			cell: proposerShare
		},
		{
			key: 'est_reward',
			header: 'Est. VOI',
			priority: 2,
			numeric: true,
			sortable: true,
			sortValue: (r) => r.est_reward,
			cell: proposerReward
		},
		{ key: 'usd', header: '≈USD', priority: 3, numeric: true, cell: proposerUsd }
	];
	const contractColumns: Column<LockContract>[] = [
		{ key: 'id', header: 'Contract', priority: 1, cell: contractId },
		{ key: 'online', header: 'Status', priority: 1, cell: contractStatus },
		{ key: 'balance', header: 'Balance', priority: 1, numeric: true, cell: contractBalance },
		{
			key: 'blocks_now',
			header: 'Blocks this epoch',
			priority: 2,
			numeric: true,
			cell: contractBlocks
		},
		{ key: 'key_expiry', header: 'Key expires', priority: 3, cell: contractKey },
		{ key: 'next_vesting', header: 'Next unlock', priority: 3, cell: contractUnlock }
	];
	import {
		Tabs,
		createHashTabs,
		SearchBox,
		createResolver,
		ChartFrame,
		LineChart,
		BarsVsExpected,
		ArchiveBanner,
		type ChartData
	} from '$lib/ds';
	import { WALLET_TABS } from '$lib/ds/Tabs/hash';
	import { annotationsFor } from '$lib/data/chartEvents';
	import {
		aprEpochs,
		stakeDaily,
		blockHistory,
		illustrativeLowBlocks,
		searchWallets,
		archiveExample
	} from './fixtures';
	let tabPanel: HTMLDivElement | undefined = $state();
	const hashTabs = createHashTabs({ ids: WALLET_TABS, panel: () => tabPanel });
	const walletTabs = WALLET_TABS.map((id) => ({
		id,
		label: id[0].toUpperCase() + id.slice(1),
		href: `#${id}`
	}));
	let selectedRange = $state('12');
	let aprRange = $state('26');
	let resolvedAddress = $state('Submit a wallet address or fixture name.');
	const recentStorage = new Map<string, string>();
	const fixtureResolver = createResolver({
		search: async (query) =>
			searchWallets
				.filter((wallet) => wallet.name.includes(query.toLowerCase()))
				.map((wallet) => ({ ...wallet, cached: true, metadata: {} })),
		lookup: async (name) =>
			searchWallets
				.filter((wallet) => wallet.name === name.toLowerCase())
				.map((wallet) => wallet.address),
		storage: {
			getItem: (key) => recentStorage.get(key) ?? null,
			setItem: (key, value) => {
				recentStorage.set(key, value);
			}
		}
	});
	const searchExamples = searchWallets
		.slice(0, 2)
		.map((wallet) => ({ label: wallet.name, href: `/wallet/${wallet.address}` }));
	let shownApr = $derived(aprEpochs.slice(-Number(aprRange)));
	let aprData: ChartData = $derived({
		columns: ['Epoch', 'APR', 'Wallets'],
		rows: shownApr.map((row) => [row.epoch, row.apr, row.wallets]),
		caption: 'Network APR (%) and earning wallets by epoch'
	});
	const stakeData: ChartData = {
		columns: ['Date', 'Online stake (M VOI)'],
		rows: stakeDaily.map((row) => [row.date, row.stake]),
		caption: 'Daily online stake in millions of VOI'
	};
	function blocksData(history: typeof blockHistory): ChartData {
		return {
			columns: ['Epoch', 'Blocks', 'Expected', 'Est. VOI'],
			rows: history.map((row) => [row.epoch, row.blocks, row.expected, row.est]),
			caption: 'Produced blocks, stake-weighted expected blocks and estimated VOI rewards'
		};
	}
	function describeBlocks(index: number, history = blockHistory) {
		const row = history[index];
		return `Epoch ${row.epoch}: ${comma(row.blocks)} blocks vs ${comma(row.expected)} expected (${Math.round((row.blocks / row.expected) * 100)}%) · est. ${compact(row.est, 1)} VOI`;
	}
	const chartStates = ['loading', 'empty', 'error', 'stale'] as const;
</script>

{#snippet proposerLink(row: Proposer)}
	<a href={`/wallet/${row.addr}`} class="break-all text-accent">{proposerName(row)}</a>
{/snippet}
{#snippet proposerBlocks(row: Proposer)}<span title={String(row.blocks)}>{comma(row.blocks)}</span
	>{/snippet}
{#snippet proposerShare(row: Proposer)}
	<div class="flex items-center justify-end gap-2">
		<div aria-hidden="true" class="hidden h-1.5 w-16 rounded-full bg-grid md:block">
			<div class="h-full rounded-full bg-bar" style:width={`${row.share * 100}%`}></div>
		</div>
		<span>{pct(row.share * 100)}</span>
	</div>
{/snippet}
{#snippet proposerReward(row: Proposer)}<span title={String(row.est_reward)}
		>{compact(row.est_reward)}</span
	>{/snippet}
{#snippet proposerUsd(row: Proposer)}{usd(row.est_reward * network.price)}{/snippet}
{#snippet proposerActions(row: Proposer)}
	<button
		type="button"
		role="menuitem"
		class="block w-full rounded-ds-xs px-3 py-2 text-start hover:bg-surface-2"
		onclick={() => (tableStatus = `Copy address selected for ${proposerName(row)} (illustrative).`)}
		>Copy address</button
	>
	<button
		type="button"
		role="menuitem"
		class="block w-full rounded-ds-xs px-3 py-2 text-start hover:bg-surface-2"
		onclick={() =>
			(tableStatus = `Edit nickname selected for ${proposerName(row)} (illustrative).`)}
		>Edit nickname</button
	>
{/snippet}
{#snippet contractId(row: LockContract)}#{row.id}{/snippet}
{#snippet contractStatus(row: LockContract)}<StatusPill
		tone={row.online ? 'ok' : 'neutral'}
		label={row.online ? 'Online' : 'Not staking'}
	/>{/snippet}
{#snippet contractBalance(row: LockContract)}<span title={String(row.balance)}
		>{compact(row.balance)}</span
	>{/snippet}
{#snippet contractBlocks(row: LockContract)}{comma(row.blocks_now)}{/snippet}
{#snippet contractKey(row: LockContract)}{row.key_expiry ?? MISSING}{/snippet}
{#snippet contractUnlock(row: LockContract)}{row.next_vesting} · {compact(row.next_amount)} VOI{/snippet}

<svelte:head>
	<title>Design system | Voi Rewards Auditor</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-canvas text-ink">
	<div class="on-hero bg-hero pb-[84px] text-on-hero rounded-b-hero">
		<Header variant="hero" current={null} />
		<div class="container-page">
			<h1 class="text-display">Design system</h1>
			<p class="mt-2 text-lede text-on-hero-muted">
				Tokens, type, formatting and display primitives. Snapshot data with labelled illustrative
				health warnings.
			</p>
			<span class="mt-4 inline-block rounded-full bg-on-hero-surface px-3 py-1 text-micro">
				Preview only
			</span>
			<div class="mt-4">
				<ThemeToggle class="text-on-hero" />
			</div>
		</div>
	</div>

	<main id="main" tabindex="-1" class="container-page -mt-[60px] grid gap-bento pb-16">
		<section aria-labelledby="gallery-stat-tile">
			<h2 id="gallery-stat-tile" class="mb-4 text-h2">StatTile</h2>
			<div class="grid gap-bento md:grid-cols-2 lg:grid-cols-4">
				<StatTile
					label="VOI price"
					icon="$"
					value={usd(network.price)}
					change={{ value: network.change24h, label: '24 hours' }}
					href="/ds"
				/>
				<StatTile
					label="Online stake"
					icon="◆"
					value={compact(network.online_stake)}
					unit="VOI"
					detail="{comma(network.online_accounts)} online accounts"
					href="/ds"
				/>
				<StatTile
					label="Staking APR"
					icon="%"
					value={pct(network.apr)}
					trend={aprHistory}
					href="/ds"
				/>
				<StatTile
					label="Blocks this epoch"
					icon="▤"
					value={comma(network.blocks)}
					detail="{comma(network.projected_blocks)} projected · Epoch {network.epoch}"
					progress={{
						value: network.blocks,
						max: network.projected_blocks,
						label: 'Blocks against epoch projection'
					}}
					href="/ds"
				/>
			</div>
			<div class="mt-4 grid gap-bento md:grid-cols-2 lg:grid-cols-3">
				{#each states as state (state)}
					<div>
						<h3 class="mb-2 text-sm font-bold">{state}</h3>
						<StatTile
							label="Staking APR"
							icon="%"
							value={pct(network.apr)}
							{state}
							{asOf}
							onretry={retry}
							detail="Annualised estimate"
							trend={aprHistory}
							href="/ds"
						/>
					</div>
				{/each}
				<StatTile
					label="Positive change (illustrative)"
					value={usd(network.price)}
					change={{ value: 0.71, label: '24 hours' }}
				/>
				<StatTile
					label="Positive change (illustrative)"
					value={usd(network.price)}
					change={{ value: 0.71, label: '24 hours' }}
				/>
			</div>
		</section>

		<section aria-labelledby="gallery-card">
			<h2 id="gallery-card" class="mb-4 text-h2">Card</h2>
			<div class="grid gap-bento md:grid-cols-2 lg:grid-cols-12">
				<Card title="Surface card" headingLevel={3} span={{ lg: 6, md: 1 }}
					><p class="text-body">A titled section with a decorative border.</p>
					{#snippet actions()}<Button variant="soft" size="sm" href="/ds">View data</Button
						>{/snippet}</Card
				>
				<Card title="This epoch" headingLevel={3} variant="hero" span={{ lg: 6, md: 1 }}
					><p class="num text-hero-num">{network.epoch}</p>
					<p class="mt-2 text-label text-on-hero-muted">
						{comma(network.elapsed_days, 2)} of 7 days elapsed
					</p></Card
				>
				{#each cardSpans as span (span)}<Card span={{ lg: span, md: 2 }}
						><p class="text-label">Untitled · lg span {span} · md span 2</p></Card
					>{/each}
			</div>
		</section>

		<section aria-labelledby="gallery-sparkline">
			<h2 id="gallery-sparkline" class="mb-4 text-h2">Sparkline</h2>
			<div class="grid gap-bento md:grid-cols-2 lg:grid-cols-3">
				{#each states as state (state)}<Card
						id={`gallery-apr-state-${state}`}
						title="APR · {state}"
						headingLevel={3}
						><Sparkline values={aprHistory} label="APR" {state} {asOf} onretry={retry} /></Card
					>{/each}
				{#each sparklineTones as tone (tone)}<Card
						id={`gallery-apr-tone-${tone}`}
						title="APR · {tone}"
						headingLevel={3}
						><Sparkline values={aprHistory} label="APR" {tone} />
						<div class="mt-3">
							<Sparkline
								values={aprHistory}
								label="APR without area"
								{tone}
								area={false}
								height={64}
							/>
						</div></Card
					>{/each}
				<Card title="Small series" headingLevel={3}
					><Sparkline values={[network.apr]} label="One APR sample" /><Sparkline
						values={[16, 16, 16]}
						label="Constant APR"
					/><Sparkline values={[]} label="No APR samples" /></Card
				>
			</div>
		</section>

		<section aria-labelledby="gallery-status-pill">
			<h2 id="gallery-status-pill" class="mb-4 text-h2">StatusPill</h2>
			<div class="flex flex-wrap gap-3 rounded-card bg-surface p-card">
				{#each sizes as size (size)}{#each tones as tone (tone)}<StatusPill
							{tone}
							label="{statusLabels[tone]} · {size}"
							{size}
						/>{/each}{/each}
			</div>
			<div class="on-hero mt-3 flex flex-wrap gap-3 rounded-hero bg-hero p-card">
				{#each sizes as size (size)}{#each tones as tone (tone)}<StatusPill
							{tone}
							label="{statusLabels[tone]} · {size}"
							{size}
							onHero
						/>{/each}{/each}
			</div>
		</section>

		<section aria-labelledby="gallery-health-item">
			<h2 id="gallery-health-item" class="mb-4 text-h2">HealthItem</h2>
			<div class="grid gap-bento md:grid-cols-2">
				<Card title="Health item sizes and tones" headingLevel={3}
					><ul aria-label="Node health checks: sizes and tones">
						{#each sizes as size (size)}{#each tones as tone (tone)}<HealthItem
									{tone}
									title="{statusLabels[tone]} · {size}"
									detail="Status includes a glyph and a word"
									{size}
								/>{/each}{/each}
					</ul></Card
				>
				<Card title="Health items on hero" headingLevel={3} variant="hero"
					><ul aria-label="Node health checks: hero">
						{#each sizes as size (size)}{#each tones as tone (tone)}<HealthItem
									{tone}
									title="{statusLabels[tone]} · {size}"
									detail="Hero detail colour"
									{size}
									onHero
								/>{/each}{/each}
					</ul></Card
				>
				<Card title="Illustrative key and vote warnings" headingLevel={3}
					><p class="mb-2 text-label text-ink-muted">
						Synthetic examples: the snapshot has no expiring keys. Last vote examples assume an
						online account.
					</p>
					<ul aria-label="Node health checks: warnings">
						{#each syntheticHealth.keys as item (item.keyDays)}<HealthItem
								tone={item.tone}
								title={item.title}
								detail="Synthetic key expiry"
							/>{/each}{#each syntheticHealth.votes as item (item.minutes)}<HealthItem
								tone={item.tone}
								title={item.title}
								detail="Synthetic online account vote age"
							/>{/each}
					</ul></Card
				>
			</div>
		</section>

		<section aria-labelledby="gallery-health-ring">
			<h2 id="gallery-health-ring" class="mb-4 text-h2">HealthRing</h2>
			<div class="grid gap-bento md:grid-cols-2 lg:grid-cols-3">
				<Card title="Node health" headingLevel={3}
					><div class="flex flex-wrap items-center gap-4">
						<HealthRing value={onlineCount} total={wallet.contracts.length} tone="ok" />
						<ul aria-label="Node health checks">
							<HealthItem
								tone="ok"
								title="{onlineCount} contracts online"
								detail="Voting on the network"
							/><HealthItem
								tone="neutral"
								title="{offlineCount} contracts offline"
								detail="Not participating"
							/><HealthItem
								tone="ok"
								title="Participation keys valid"
								detail="Online keys have {comma(wallet.contracts[0].key_days)} days remaining"
							/>
						</ul>
					</div></Card
				>
				{#each states as state (state)}<Card
						id={`gallery-contracts-state-${state}`}
						title="Contracts · {state}"
						headingLevel={3}
						><HealthRing
							value={onlineCount}
							total={wallet.contracts.length}
							tone="warn"
							{state}
							{asOf}
							onretry={retry}
						/></Card
					>{/each}
				{#each ringTones as tone (tone)}<Card
						id={`gallery-ring-tone-${tone}`}
						title="Ring · {tone}"
						headingLevel={3}
						><HealthRing
							value={tone === 'danger' ? 0 : tone === 'ok' ? 16 : onlineCount}
							total={16}
							{tone}
						/></Card
					>{/each}
				<Card title="No staking contracts" headingLevel={3}
					><HealthRing value={0} total={0} tone="danger" /></Card
				>
			</div>
		</section>

		<section aria-labelledby="gallery-button" class="rounded-card bg-surface p-card">
			<h2 id="gallery-button" class="mb-4 text-h2">Button</h2>
			<div class="flex flex-wrap items-center gap-3">
				{#each buttonVariants as variant (variant)}{#each sizes as size (size)}<Button
							{variant}
							{size}>{variant} · {size}</Button
						><Button {variant} {size} disabled>{variant} disabled · {size}</Button><Button
							{variant}
							{size}
							href="/ds">{variant} link · {size}</Button
						><Button {variant} {size} href="/ds" disabled>{variant} link disabled · {size}</Button
						>{/each}{/each}
			</div>
		</section>

		<section aria-labelledby="gallery-chip" class="rounded-card bg-surface p-card">
			<h2 id="gallery-chip" class="mb-4 text-h2">Chip</h2>
			<div class="flex flex-wrap gap-3">
				{#each chipTones as tone (tone)}<Chip {tone} label={tone} /><Chip
						{tone}
						label={tone}
						count={onlineCount}
					/>{/each}
			</div>
		</section>

		<section aria-labelledby="gallery-copy-button">
			<h2 id="gallery-copy-button" class="mb-4 text-h2">CopyButton</h2>
			<div class="flex flex-wrap items-center gap-3 rounded-card bg-surface p-card">
				<span class="text-sm">{shortAddr(wallet.owner)}</span><CopyButton
					text={wallet.owner}
					what="wallet address"
				/><span class="text-label text-ink-muted"
					>Copy with Enter or Space. Success is announced; clipboard failures show “Copy failed”.</span
				>
			</div>
			<div class="on-hero mt-3 flex items-center gap-3 rounded-hero bg-hero p-card text-on-hero">
				<span class="text-sm">{shortAddr(wallet.owner)}</span><CopyButton
					text={wallet.owner}
					what="wallet address on hero"
					onHero
				/>
			</div>
		</section>

		<section
			aria-labelledby="gallery-inline-alert"
			class="space-y-3 rounded-card bg-surface p-card"
		>
			<h2 id="gallery-inline-alert" class="text-h2">InlineAlert</h2>
			<InlineAlert message="Unable to refresh node health." onretry={retry} />
			<InlineAlert message="Unable to refresh node health. Retry unavailable." />
			<InlineAlert
				tone="warn"
				message="Data may be out of date."
				onretry={retry}
				retryLabel="Refresh"
			/>
			<InlineAlert tone="warn" message="Data may be out of date. Retry unavailable." />
			<p class="text-label text-ink-muted" aria-live="polite">Gallery retry clicks: {retries}</p>
		</section>

		<section aria-labelledby="gallery-data-table">
			<h2 id="gallery-data-table" class="mb-4 text-h2">DataTable</h2>
			<div class="grid gap-bento">
				<Card title="Who's earning this epoch" headingLevel={3} id="gallery-proposers">
					<DataTable
						columns={proposerColumns}
						rows={proposers}
						rowKey={(row) => row.addr}
						rowName={proposerName}
						caption="Who's earning this epoch"
						captionHidden
						bind:sort={proposerSort}
						limit={15}
						moreLabel={() => `See all ${proposers.length} proposers`}
						expandable
						rowActions={proposerActions}
						favourite={{
							pressed: (row) => favourites.includes(row.addr),
							ontoggle: (row) => {
								favourites = favourites.includes(row.addr)
									? favourites.filter((addr) => addr !== row.addr)
									: [...favourites, row.addr];
							}
						}}
					/>
					<p class="mt-2 text-label text-ink-muted" aria-live="polite">{tableStatus}</p>
				</Card>
				<Card title="Lock contracts" headingLevel={3} id="gallery-lock-contracts">
					<DataTable
						columns={contractColumns}
						rows={lockContracts}
						rowKey={(row) => String(row.id)}
						rowName={(row) => `contract #${row.id}`}
						caption="Lock contracts"
						captionHidden
						density="compact"
						expandable
						limit={7}
						moreLabel={(n) =>
							`Show ${n} more not-staking contracts (${compact(hiddenBalance, 1)} VOI)`}
					/>
				</Card>
				{#each states.filter((state) => state !== 'ready') as state (state)}
					<Card title={`Table · ${state}`} headingLevel={3} id={`gallery-table-${state}`}>
						<DataTable
							columns={proposerColumns.slice(0, 3)}
							rows={proposers.slice(0, 2)}
							rowKey={(row) => row.addr}
							caption={`Proposers · ${state}`}
							{state}
							{asOf}
							onretry={retry}
						/>
					</Card>
				{/each}
			</div>
		</section>
		<section aria-labelledby="gallery-epoch-stepper">
			<h2 id="gallery-epoch-stepper" class="mb-4 text-h2">EpochStepper</h2>
			<div class="grid gap-bento">
				<Card title="Current epoch · URL sync" headingLevel={3} id="gallery-current-epoch">
					<EpochStepper
						bind:epoch={currentEpoch}
						min={1}
						max={104}
						rangeLabel={epochRange}
						syncUrl
						id="gallery-epoch-current"
					/>
					<p class="mt-2 text-label text-ink-muted">Selected: {currentEpoch}</p>
				</Card>
				<Card title="First epoch" headingLevel={3} id="gallery-first-epoch">
					<EpochStepper
						bind:epoch={firstEpoch}
						min={1}
						max={104}
						rangeLabel={epochRange}
						id="gallery-epoch-first"
					/>
					<p class="mt-2 text-label text-ink-muted">Selected: {firstEpoch}</p>
				</Card>
				<Card title="Epoch without jump" headingLevel={3} id="gallery-simple-epoch">
					<EpochStepper
						bind:epoch={simpleEpoch}
						min={1}
						max={104}
						rangeLabel={epochRange}
						jump={false}
						id="gallery-epoch-simple"
					/>
					<p class="mt-2 text-label text-ink-muted">Selected: {simpleEpoch}</p>
				</Card>
			</div>
		</section>

		<section class="rounded-card bg-surface p-card shadow-card">
			<h2 class="text-h2">Colour</h2>
			<ul class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
				{#each colours as [cls, name] (name)}
					<li class="text-label">
						<div class="h-12 rounded-ds-xs border border-line {cls}"></div>
						<span class="mt-1 block text-ink-muted">{name}</span>
					</li>
				{/each}
			</ul>
			<div class="mt-4 grid gap-3 sm:grid-cols-2">
				<div class="h-12 rounded-ds-xs bg-hero"></div>
				<div class="h-3 self-center rounded-full bg-bar"></div>
			</div>
		</section>

		<section class="rounded-card bg-surface p-card shadow-card">
			<h2 class="text-h2">Type</h2>
			<ul class="mt-4 space-y-3">
				{#each type as [cls, sample] (cls)}
					<li class="flex flex-wrap items-baseline gap-x-4">
						<code class="w-28 shrink-0 text-micro text-ink-muted">{cls}</code>
						<span class={cls}>{sample}</span>
					</li>
				{/each}
			</ul>
		</section>

		<section class="rounded-card bg-surface p-card shadow-card">
			<h2 class="text-h2">Radii and shadows</h2>
			<ul class="mt-4 flex flex-wrap gap-4">
				{#each radii as r (r)}
					<li class="text-label text-ink-muted">
						<div class="h-16 w-24 border border-edge bg-surface-2 {r}"></div>
						<span class="mt-1 block">{r}</span>
					</li>
				{/each}
				<li class="text-label text-ink-muted">
					<div class="h-16 w-24 rounded-ds-sm bg-surface shadow-card"></div>
					<span class="mt-1 block">shadow-card</span>
				</li>
				<li class="text-label text-ink-muted">
					<div class="h-16 w-24 rounded-ds-sm bg-surface shadow-pop"></div>
					<span class="mt-1 block">shadow-pop</span>
				</li>
			</ul>
		</section>

		<section class="rounded-card bg-surface p-card shadow-card">
			<h2 class="text-h2">Formatting</h2>
			<table class="mt-4 w-full text-sm">
				<thead>
					<tr class="text-left text-micro text-ink-muted">
						<th scope="col" class="py-2 font-bold">Call</th>
						<th scope="col" class="py-2 font-bold">Output</th>
					</tr>
				</thead>
				<tbody>
					{#each numbers as [call, out] (call)}
						<tr class="border-t border-line">
							<td class="py-2"><code>{call}</code></td>
							<td class="num py-2 font-bold">{out}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="rounded-card bg-surface p-card shadow-card">
			<h2 class="text-h2">Controls</h2>
			<div class="mt-4 flex flex-wrap items-center gap-3">
				<button class="rounded-ds-sm bg-primary-700 px-4 py-2.5 font-bold text-white"
					>Primary</button
				>
				<button class="rounded-ds-sm bg-accent-soft px-4 py-2.5 font-bold text-accent">Soft</button>
				<button class="rounded-ds-sm px-4 py-2.5 font-bold text-accent">Ghost</button>
				<input
					class="rounded-ds-sm border border-edge bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
					placeholder="Input with edge border"
					aria-label="Example input"
				/>
				<a href="/ds" class="text-accent underline">A link</a>
			</div>
		</section>
		<section aria-labelledby="gallery-tabs">
			<h2 id="gallery-tabs" class="mb-4 text-title">Tabs</h2>
			<div class="grid gap-bento">
				<Card title="Wallet navigation" headingLevel={3}>
					<div class="on-hero rounded-ds-md bg-hero p-3">
						<Tabs
							variant="nav"
							items={walletTabs}
							current={hashTabs.current}
							label="Wallet sections"
						/>
					</div>
					<div bind:this={tabPanel} tabindex="-1" class="mt-3 rounded-ds-xs p-2 text-body">
						{walletTabs.find((tab) => tab.id === hashTabs.current)?.label}
					</div>
				</Card>
				<Card title="Segmented range" headingLevel={3}>
					<div class="flex flex-wrap items-center gap-3">
						<Tabs
							variant="segmented"
							label="Range"
							options={[
								{ value: '12', label: '12 epochs' },
								{ value: '26', label: '26 epochs' },
								{ value: 'all', label: 'All' }
							]}
							bind:value={selectedRange}
						/>
						<span class="text-label"
							>Selected: {selectedRange === 'all' ? 'All' : `${selectedRange} epochs`}</span
						>
					</div>
				</Card>
			</div>
		</section>
		<section aria-labelledby="gallery-search">
			<h2 id="gallery-search" class="mb-4 text-title">SearchBox</h2>
			<div class="grid gap-bento">
				<Card title="Hero wallet search" headingLevel={3} variant="hero">
					<SearchBox
						variant="hero"
						resolver={fixtureResolver}
						connected={searchWallets.slice(0, 1)}
						examples={searchExamples}
						onsubmit={(address) => {
							resolvedAddress = address;
						}}
					/>
				</Card>
				<Card title="Compact wallet search" headingLevel={3}>
					<SearchBox
						variant="compact"
						formLabel="Gallery wallet search"
						resolver={fixtureResolver}
						connected={searchWallets.slice(0, 1)}
						onsubmit={(address) => {
							resolvedAddress = address;
						}}
					/>
				</Card>
			</div>
			<p role="status" class="mt-3 break-all text-sm">{resolvedAddress}</p>
		</section>
		<section aria-labelledby="gallery-charts">
			<h2 id="gallery-charts" class="mb-4 text-title">ChartFrame and chart primitives</h2>
			<div class="grid gap-bento lg:grid-cols-2">
				<ChartFrame
					title="APR by epoch"
					headingLevel={3}
					summary="Network APR by epoch, with the offline-stake event marked at epoch 102."
					data={aprData}
					x={{ kind: 'band', values: shownApr.map((row) => row.epoch) }}
					y={{ domain: [0, Math.max(...shownApr.map((row) => row.apr))], format: pct }}
					annotations={annotationsFor('apr', 'epoch')}
					legend={[{ label: 'APR', swatch: 'fill' }]}
				>
					{#snippet actions()}<Tabs
							variant="segmented"
							label="APR range"
							options={[
								{ value: '12', label: '12 epochs' },
								{ value: '26', label: '26 epochs' }
							]}
							bind:value={aprRange}
						/>{/snippet}
					{#snippet children(ctx)}<LineChart
							{ctx}
							points={shownApr.map((row) => ({ x: row.epoch, y: row.apr }))}
							format={pct}
						/>{/snippet}
				</ChartFrame>
				<ChartFrame
					title="Online stake, 30 days"
					headingLevel={3}
					summary="Online stake fell during October 8–12 and recovered to 725.2 million VOI."
					data={stakeData}
					x={{
						kind: 'time',
						domain: [new Date(stakeDaily[0].date), new Date(stakeDaily[stakeDaily.length - 1].date)]
					}}
					y={{
						domain: [0, Math.max(...stakeDaily.map((row) => row.stake))],
						format: (n) => compact(n * 1e6, 1)
					}}
					annotations={annotationsFor('onlineStake', 'date')}
					legend={[{ label: 'Online stake', swatch: 'fill' }]}
				>
					{#snippet children(ctx)}<LineChart
							{ctx}
							points={stakeDaily.map((row) => ({ x: new Date(row.date), y: row.stake }))}
							format={(n) => compact(n * 1e6, 1)}
						/>{/snippet}
				</ChartFrame>
				<ChartFrame
					title="Blocks vs expected"
					headingLevel={3}
					summary="Produced blocks exceeded stake-weighted expectations, reaching 148% in epoch 102."
					data={blocksData(blockHistory)}
					x={{ kind: 'band', values: blockHistory.map((row) => row.epoch) }}
					y={{ domain: [0, 28000], format: (n) => (n === 0 ? '0' : comma(n / 1000, 1) + 'k') }}
					describe={(index) => describeBlocks(index)}
					annotations={annotationsFor('blocksVsExpected', 'epoch')}
					legend={[
						{ label: 'Blocks', swatch: 'fill' },
						{ label: 'Expected', swatch: 'expected' }
					]}
				>
					{#snippet children(ctx)}<BarsVsExpected
							{ctx}
							bars={blockHistory.map((row) => ({
								x: row.epoch,
								value: row.blocks,
								expected: row.expected
							}))}
						/>{/snippet}
				</ChartFrame>
				<ChartFrame
					title="Blocks vs expected (illustrative low epoch)"
					headingLevel={3}
					summary="Synthetic example: epoch 99 is below 85% of expected blocks, demonstrating the warning style."
					data={blocksData(illustrativeLowBlocks)}
					x={{ kind: 'band', values: illustrativeLowBlocks.map((row) => row.epoch) }}
					y={{ domain: [0, 28000], format: (n) => (n === 0 ? '0' : comma(n / 1000, 1) + 'k') }}
					describe={(index) => describeBlocks(index, illustrativeLowBlocks)}
					annotations={[
						{
							id: 'synthetic-low',
							at: 99,
							label: 'Synthetic low epoch',
							detail:
								'Illustrative data: epoch 99 was changed to 12,000 blocks to demonstrate a ratio below 85%.',
							tone: 'neutral'
						}
					]}
					legend={[
						{ label: 'Blocks', swatch: 'fill' },
						{ label: 'Expected', swatch: 'expected' }
					]}
				>
					{#snippet children(ctx)}<BarsVsExpected
							{ctx}
							bars={illustrativeLowBlocks.map((row) => ({
								x: row.epoch,
								value: row.blocks,
								expected: row.expected
							}))}
						/>{/snippet}
				</ChartFrame>
				{#each chartStates as state (state)}
					<ChartFrame
						title={`Chart state: ${state}`}
						headingLevel={3}
						summary="Network APR by epoch."
						{state}
						{asOf}
						onretry={retry}
						data={state === 'empty' ? { ...aprData, rows: [] } : aprData}
						x={{ kind: 'band', values: shownApr.map((row) => row.epoch) }}
						y={{ domain: [0, 25], format: pct }}
					>
						{#snippet children(ctx)}<LineChart
								{ctx}
								points={shownApr.map((row) => ({ x: row.epoch, y: row.apr }))}
								format={pct}
							/>{/snippet}
					</ChartFrame>
				{/each}
			</div>
		</section>
		<section aria-labelledby="gallery-archive">
			<h2 id="gallery-archive" class="mb-4 text-title">ArchiveBanner</h2>
			<ArchiveBanner {...archiveExample} />
		</section>
	</main>
	<Footer />
</div>
