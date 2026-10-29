<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button, Card, Chip, DataTable, EpochStepper, Tabs, type Column } from '$lib/ds';
	import type { SortState } from '$lib/ds/DataTable/types';
	import { sortRows } from '$lib/ds/DataTable/sort';
	import { comma, pct, shortAddr, usd } from '$lib/ds/format';
	import { epochRange } from '$lib/epochs';
	import { rewardsRefreshMode } from '$lib/home/headline';
	import { filterProposer, rewardRows, rewardsCSV, type RewardRow } from '$lib/home/rewards';
	import type { DashboardData } from '$lib/server/home';
	import { getTokensByEpoch } from '$lib/utils';
	import { getEnvoiNames } from '$lib/utils/envoi';
	import { nicknames } from '$lib/stores/nicknames';
	import { dataTable } from '../../stores/dataTable';
	import { favorites } from '../../stores/favorites';
	import NicknameDialog from './NicknameDialog.svelte';

	let {
		initial,
		currentEpoch,
		initialEpoch,
		price
	}: {
		initial: DashboardData['rewards'];
		currentEpoch: number;
		initialEpoch: number;
		price: DashboardData['price'];
	} = $props();
	type Row = RewardRow & {
		name?: string;
		nickname?: string;
		nodes?: { node_name: string | null }[];
	};
	let epoch = $state(initialEpoch);
	let response = $state(initial.state === 'error' ? null : initial.value.data);
	let pool = $state<number | null>(
		initial.state === 'error' ? null : initial.value.params.block_reward_pool
	);
	let asOf = $state(initial.state === 'stale' ? initial.asOf : undefined);
	let dataState = $state<'ready' | 'loading' | 'stale' | 'error'>(initial.state);
	let clock = $state(
		new Date(
			initial.state === 'error' ? Date.now() : (initial.value.data.max_timestamp ?? Date.now())
		)
	);
	let priceValue = $state<number | null>(null);
	let names = $state<Record<string, string>>({});
	let query = $state('');
	let show = $state('all');
	let showNames = $state(true);
	let sort = $state<SortState>({ key: 'blocks', dir: 'desc' });
	let editing = $state<string | null>(null);
	let announcement = $state('');
	let appliedInitial = initial;
	let lastRequested = initialEpoch;
	let hasSelectedEpoch = false;
	let requestId = 0;
	const namesRequested = new Set<string>();
	let allRows = $derived.by(() => {
		if (!response) return [];
		const source = new Map(response.data.map((row) => [row.proposer, row]));
		return rewardRows(response, {
			epoch,
			rangeId: epochRange(epoch).id,
			pool,
			now: clock,
			price: priceValue
		}).map(
			(row): Row => ({
				...row,
				name: names[row.addr] ?? source.get(row.addr)?.nfd,
				nickname: $nicknames[row.addr],
				nodes: source.get(row.addr)?.nodes
			})
		);
	});
	let rows = $derived(
		allRows.filter(
			(row) =>
				filterProposer(row, query) && (show !== 'favourites' || $favorites.includes(row.addr))
		)
	);
	let topShare = $derived(allRows[0]?.share ?? 0);
	let emptyText = $derived(
		query
			? 'No proposers match this filter'
			: show === 'favourites'
				? 'No favourites in this epoch'
				: 'No blocks yet this epoch'
	);

	$effect(() => {
		let active = true;
		priceValue = null;
		void price.then(
			(loaded) => {
				if (active) priceValue = loaded.state === 'error' ? null : loaded.value.price;
			},
			() => {
				if (active) priceValue = null;
			}
		);
		return () => {
			active = false;
		};
	});
	$effect(() => {
		if (initial === appliedInitial) return;
		appliedInitial = initial;
		if (rewardsRefreshMode(initial, hasSelectedEpoch) !== 'all' || initial.state === 'error')
			return;
		requestId++;
		lastRequested = initialEpoch;
		epoch = initialEpoch;
		response = initial.value.data;
		pool = initial.value.params.block_reward_pool;
		clock = new Date(initial.value.data.max_timestamp ?? Date.now());
		dataState = initial.state;
		asOf = initial.state === 'stale' ? initial.asOf : undefined;
	});
	$effect(() => {
		const selected = epoch;
		if (selected === lastRequested) return;
		lastRequested = selected;
		hasSelectedEpoch = true;
		untrack(() => {
			void loadEpoch(selected);
		});
	});
	$effect(() => {
		const count = rows.length;
		const filtered = Boolean(query) || show === 'favourites';
		const timer = setTimeout(() => {
			announcement = filtered ? `${count} proposers match` : '';
		}, 350);
		return () => clearTimeout(timer);
	});
	$effect(() => () => {
		requestId++;
	});

	async function loadEpoch(selected: number, refresh = false) {
		const request = ++requestId;
		dataState = 'loading';
		if (refresh) dataTable.clearCache();
		try {
			const [data, tokens] = await Promise.all([
				dataTable.fetchData(epochRange(selected).id),
				getTokensByEpoch(selected)
			]);
			if (request !== requestId) return;
			response = data;
			pool = tokens;
			clock = new Date();
			asOf = undefined;
			dataState = 'ready';
		} catch {
			if (request === requestId) dataState = 'error';
		}
	}
	// DataTable owns sorting and expansion. Resolve only links it actually renders,
	// including newly revealed rows, without coupling to its private expansion state.
	function resolveVisibleNames(node: HTMLElement) {
		let active = true;
		function resolve() {
			const addresses = [...node.querySelectorAll<HTMLAnchorElement>('a[data-proposer]')]
				.map((link) => link.dataset.proposer!)
				.filter((addr) => !namesRequested.has(addr));
			if (!addresses.length) return;
			addresses.forEach((addr) => namesRequested.add(addr));
			void getEnvoiNames(addresses).then((found) => {
				if (active)
					names = { ...names, ...Object.fromEntries(found.map((row) => [row.address, row.name])) };
			});
		}
		const observer = new MutationObserver(resolve);
		observer.observe(node, { childList: true, subtree: true });
		resolve();
		return {
			destroy() {
				active = false;
				observer.disconnect();
			}
		};
	}
	function download() {
		const url = URL.createObjectURL(
			new Blob(
				[rewardsCSV(sortRows(rows, columns.find((column) => column.key === sort.key)!, sort.dir))],
				{ type: 'text/csv;charset=utf-8;' }
			)
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'phase2_rewards.csv';
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}
	async function copyAddress(addr: string) {
		try {
			await navigator.clipboard.writeText(addr);
			announcement = 'Address copied';
		} catch {
			announcement = 'Unable to copy address';
		}
	}
	const columns = [
		{ key: 'rank', header: '#', numeric: true, priority: 1 },
		{
			key: 'proposer',
			header: 'Proposer',
			sortable: true,
			sortValue: (r) => r.name ?? r.addr,
			priority: 1,
			cell: proposer
		},
		{
			key: 'blocks',
			header: 'Blocks',
			numeric: true,
			sortable: true,
			sortValue: (r) => r.blocks,
			priority: 1,
			cell: blocks
		},
		{
			key: 'share',
			header: 'Share',
			numeric: true,
			sortable: true,
			sortValue: (r) => r.share,
			priority: 2,
			cell: share
		},
		{
			key: 'est',
			header: 'Est. VOI',
			numeric: true,
			sortable: true,
			sortValue: (r) => r.est,
			priority: 2,
			cell: estimate
		},
		{ key: 'usd', header: '≈ USD', numeric: true, priority: 3, cell: dollars }
	] satisfies Column<Row>[];
</script>

{#snippet proposer(row: Row)}
	<a href="/wallet/{row.addr}" data-proposer={row.addr} class="break-all font-bold text-accent"
		>{showNames && row.name ? row.name : shortAddr(row.addr)}</a
	>
	{#if row.nickname}<span class="block break-all"><Chip label={row.nickname} /></span>{/if}
{/snippet}
{#snippet blocks(row: Row)}{comma(row.blocks)}{/snippet}
{#snippet share(row: Row)}
	<div class="flex items-center justify-end gap-2">
		<div class="hidden h-2 min-w-4 flex-1 rounded-full bg-surface-2 md:block" aria-hidden="true">
			<div
				class="h-2 rounded-full bg-bar"
				style:width="{topShare > 0 ? ((row.share ?? 0) / topShare) * 100 : 0}%"
			></div>
		</div>
		<span>{pct(row.share === null ? null : row.share * 100, 1)}</span>
	</div>
{/snippet}
{#snippet estimate(row: Row)}{comma(row.est)}{/snippet}
{#snippet dollars(row: Row)}{usd(row.usd)}{/snippet}
{#snippet detail(row: Row)}<p class="break-all text-label text-ink-muted">{row.addr}</p>{/snippet}
{#snippet rowActions(row: Row)}
	<button
		type="button"
		role="menuitem"
		class="min-h-11 w-full rounded-ds-xs px-3 text-start"
		onclick={() => copyAddress(row.addr)}>Copy address</button
	>
	<button
		type="button"
		role="menuitem"
		class="min-h-11 w-full rounded-ds-xs px-3 text-start"
		onclick={() => {
			editing = row.addr;
		}}>{row.nickname ? 'Edit nickname' : 'Add nickname'}</button
	>
	<button
		type="button"
		role="menuitem"
		class="min-h-11 w-full rounded-ds-xs px-3 text-start"
		onclick={() => goto('/wallet/' + row.addr)}>Open wallet</button
	>
{/snippet}
{#snippet actions()}
	<EpochStepper
		bind:epoch
		min={1}
		max={currentEpoch}
		rangeLabel={(e) => epochRange(e).label}
		jump
		syncUrl
	/>
{/snippet}

<Card title="Who's earning this epoch" span={{ lg: 8, md: 2 }} {actions}>
	<div class="mb-4 flex min-w-0 flex-wrap items-center gap-2">
		<input
			type="search"
			aria-label="Filter proposers"
			placeholder="Filter by address, enVoi name, nickname or node"
			bind:value={query}
			class="min-h-11 min-w-0 w-full flex-auto rounded-ds-sm border border-edge bg-surface px-3 text-sm text-ink"
		/>
		{#if $favorites.length}
			<Tabs
				variant="segmented"
				label="Show"
				bind:value={show}
				options={[
					{ value: 'all', label: 'All' },
					{ value: 'favourites', label: 'Favourites' }
				]}
			/>
		{/if}
		<Button
			variant="soft"
			onclick={download}
			disabled={dataState === 'loading' || dataState === 'error'}>Download CSV</Button
		>
		<Button
			variant="ghost"
			aria-pressed={showNames}
			onclick={() => {
				showNames = !showNames;
			}}>Show enVoi names</Button
		>
		<Button
			variant="soft"
			onclick={() => loadEpoch(epoch, true)}
			disabled={dataState === 'loading'}
			aria-busy={dataState === 'loading'}>Refresh</Button
		>
	</div>
	<div use:resolveVisibleNames>
		<DataTable
			{columns}
			{rows}
			rowKey={(r) => r.addr}
			rowName={(r) => r.name ?? shortAddr(r.addr)}
			caption="Who's earning this epoch"
			captionHidden
			id="home-rewards"
			bind:sort
			limit={15}
			moreLabel={() => `See all ${rows.length} proposers`}
			expandable
			{detail}
			{rowActions}
			favourite={{
				pressed: (r) => $favorites.includes(r.addr),
				ontoggle: (r) => favorites.toggle(r.addr)
			}}
			state={dataState === 'ready' && !rows.length ? 'empty' : dataState}
			{asOf}
			{emptyText}
			onretry={() => loadEpoch(epoch)}
		/>
	</div>
	<p class="sr-only" aria-live="polite">{announcement}</p>
</Card>
<NicknameDialog
	address={editing}
	onclose={() => {
		editing = null;
	}}
/>
