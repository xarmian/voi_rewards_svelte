<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { FungibleTokenType, NFTToken } from '$lib/types/assets';
	import {
		deriveHoldingsDisplay,
		holdingsAmount,
		type HoldingsAccount,
		type HoldingsRow,
		type HoldingsSplit
	} from '$lib/wallet/holdings';
	import type { DataState } from '../types';
	import type { Column, SortState } from '../DataTable/types';
	import { sortRows } from '../DataTable/sort';
	import Card from '../Card/Card.svelte';
	import StatTile from '../StatTile/StatTile.svelte';
	import StatusPill from '../StatusPill/StatusPill.svelte';
	import DataTable from '../DataTable/DataTable.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import Button from '../Button/Button.svelte';
	import CopyButton from '../CopyButton/CopyButton.svelte';
	import WalletNfts from '../WalletNfts/WalletNfts.svelte';
	import { comma, usd } from '../format';

	let {
		scopeLabel = 'Account and listed contracts',
		pageAddress,
		account,
		tokens,
		tokenState = 'loading',
		partial = false,
		tokenError,
		asOf,
		split,
		price = null,
		onretryAccount,
		onretryTokens,
		nativeActions,
		tokenActions,
		claims,
		nfts,
		nftState = 'idle',
		nftPartial = false,
		nftMetadataLoading = false,
		onnfts,
		onretryNfts
	}: {
		scopeLabel?: string;
		pageAddress: string;
		account: HoldingsAccount;
		tokens: FungibleTokenType[];
		tokenState?: DataState;
		partial?: boolean;
		tokenError?: string | null;
		asOf?: string;
		split?: HoldingsSplit;
		price?: number | null;
		onretryAccount?: () => void;
		onretryTokens?: () => void;
		nativeActions?: Snippet;
		tokenActions?: Snippet<[FungibleTokenType]>;
		claims?: Snippet;
		nfts?: NFTToken[];
		nftState?: DataState | 'idle';
		nftPartial?: boolean;
		nftMetadataLoading?: boolean;
		onnfts?: () => void;
		onretryNfts?: () => void;
	} = $props();
	let showDust = $state(false);
	let tokensExpanded = $state(false);
	let tokenSort = $state<SortState>({ key: 'value', dir: 'desc' });
	let lpSort = $state<SortState>({ key: 'value', dir: 'desc' });
	const display = $derived(
		deriveHoldingsDisplay({
			pageAddress,
			account,
			tokens,
			tokenState,
			partial,
			split,
			price,
			showDust
		})
	);
	const columns = $derived<Column<HoldingsRow>[]>([
		{
			key: 'name',
			header: 'Token',
			priority: 1,
			sortable: true,
			sortValue: (r) => r.token.name,
			cell: identity
		},
		{
			key: 'quantity',
			header: 'Quantity',
			priority: 2,
			align: 'end',
			numeric: true,
			sortable: true,
			sortValue: (r) => r.quantity,
			cell: quantity
		},
		{
			key: 'value',
			header: 'VOI equivalent',
			priority: 1,
			align: 'end',
			numeric: true,
			sortable: true,
			sortValue: (r) => r.value,
			cell: value
		},
		{
			key: 'usd',
			header: '≈USD',
			priority: 3,
			align: 'end',
			numeric: true,
			sortable: true,
			sortValue: (r) => r.usd,
			cell: dollars
		}
	]);
	const lpColumns = $derived<Column<HoldingsRow>[]>([
		{ ...columns[0], header: 'Pair' },
		{
			key: 'venue',
			header: 'Venue',
			priority: 2,
			sortable: true,
			sortValue: (r) => r.token.poolInfo?.provider,
			cell: venue
		},
		{ ...columns[1], header: 'LP quantity' },
		columns[2],
		columns[3]
	]);
	// Own the initial slice so DataTable never offers its reversible list expansion.
	const tokenRows = $derived.by(() => {
		const column = columns.find((column) => column.key === tokenSort.key)!;
		const sorted = sortRows(display.rows.tokens, column, tokenSort.dir);
		return tokensExpanded ? sorted : sorted.slice(0, 10);
	});
	const tableState = $derived(tokenState);
</script>

{#snippet identity(row: HoldingsRow)}<span class="break-words" title={row.token.name}
		>{row.token.name}</span
	>{/snippet}
{#snippet quantity(row: HoldingsRow)}<span title={String(row.quantity)}
		>{holdingsAmount(row.quantity)} {row.token.symbol}</span
	>{/snippet}
{#snippet value(row: HoldingsRow)}<span
		title={row.value === null ? 'Unavailable' : `${row.value} VOI equivalent`}
		>{row.valueLabel}</span
	>{/snippet}
{#snippet dollars(row: HoldingsRow)}{row.usd === null
		? 'Unavailable'
		: `≈ ${usd(row.usd)}`}{/snippet}
{#snippet venue(row: HoldingsRow)}{row.token.poolInfo?.provider ?? 'Unavailable'}{/snippet}
{#snippet detail(row: HoldingsRow)}
	<div class="min-w-0 space-y-3 break-words" data-token-id={row.token.id}>
		<dl class="grid min-w-0 grid-cols-1 gap-2 text-sm md:grid-cols-2">
			<div>
				<dt class="text-ink-muted">Exact quantity</dt>
				<dd>{row.quantity === null ? 'Unavailable' : String(row.quantity)} {row.token.symbol}</dd>
			</div>
			<div>
				<dt class="text-ink-muted">Token ID</dt>
				<dd>{row.token.id} <CopyButton text={row.token.id} what="token ID" /></dd>
			</div>
			<div>
				<dt class="text-ink-muted">VOI equivalent</dt>
				<dd>
					{row.value === null ? 'Unavailable' : comma(row.value, 2)}{row.value === null
						? ''
						: ' VOI'}
				</dd>
			</div>
			<div>
				<dt class="text-ink-muted">≈USD</dt>
				<dd>{@render dollars(row)}</dd>
			</div>
		</dl>
		{#if partial}<StatusPill tone="warn" label="Approval and pool details incomplete" />{/if}
		{#if row.token.poolInfo}
			{#if row.underlying}<dl class="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
					{#each row.underlying as amount}<div>
							<dt class="text-ink-muted">{amount.symbol} amount</dt>
							<dd title={String(amount.amount)}>{holdingsAmount(amount.amount)}</dd>
						</div>{/each}
				</dl>
			{:else}<p class="text-sm text-ink-muted">Underlying amounts unavailable.</p>{/if}
		{/if}
		<div class="wallet-token-legacy" data-lp={row.token.poolInfo ? '' : undefined}>
			{@render tokenActions?.(row.token)}
		</div>
	</div>
{/snippet}
{#snippet tokenControls()}
	<div class="flex flex-wrap items-center gap-2">
		<Button variant="soft" onclick={onretryTokens} disabled={tokenState === 'loading'}
			>Refresh tokens</Button
		>
		{#if !showDust}
			<Button variant="soft" onclick={() => (showDust = true)}>Show dust</Button>
		{/if}
	</div>
{/snippet}
{#snippet nativeControls()}<div class="flex flex-wrap gap-2">
		{@render nativeActions?.()}
	</div>{/snippet}

<div class="grid min-w-0 grid-cols-1 gap-bento md:grid-cols-2 lg:grid-cols-12">
	<Card title="Holdings" span={{ lg: 12, md: 2 }} actions={nativeControls}>
		{#if account.status === 'unavailable'}<InlineAlert
				message="VOI balance unavailable"
				onretry={onretryAccount}
			/>{/if}
		<StatTile
			label="Page VOI balance"
			value={holdingsAmount(display.pageLiquid)}
			unit="VOI"
			state={account.status === 'loading' ? 'loading' : 'ready'}
		/>
		{#if account.status === 'loaded'}<p class="mt-3 text-sm text-ink-muted">
				Minimum balance: {account.value.minBalance / 1e6} VOI.
			</p>{/if}
		{#if display.total !== null}<p
				class="mt-4 text-h2"
				aria-label="Holdings total"
				title={`${display.total} VOI`}
			>
				{holdingsAmount(display.total)} VOI · {display.usd === null
					? 'USD unavailable'
					: `≈ ${usd(display.usd)}`}
			</p>{/if}
		{#if display.composition}<div
				aria-label="Holdings composition"
				class="my-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-grid"
			>
				{#each display.composition as part}<div
						aria-hidden="true"
						class={part.color}
						style:width={`${display.total ? (part.value! / display.total) * 100 : 0}%`}
					></div>{/each}
			</div>{/if}
		<dl class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
			{#each display.parts as part}<div>
					<dt class="flex items-center gap-2 text-sm text-ink-muted">
						<span aria-hidden="true" class={`h-2 w-2 rounded-sm ${part.color}`}></span>{part.label}
					</dt>
					<dd class="text-h2" title={part.value === null ? undefined : `${part.value} VOI`}>
						{holdingsAmount(part.value)}{part.value === null ? '' : ' VOI'}
					</dd>
				</div>{/each}
		</dl>
		{#if display.parts[0].value === null}<p class="mt-3 text-sm text-ink-muted">
				Locked balance unavailable.
			</p>{/if}
		<p class="mt-3 text-sm text-ink-muted">
			{scopeLabel}. Tokens and liquidity positions belong only to the page address. Tokens and other
			includes unlocked VOI in contracts.
		</p>
	</Card>
	<Card title="Tokens" span={{ lg: 12, md: 2 }} actions={tokenControls}>
		{#if partial}<InlineAlert
				tone="warn"
				message="Some pool or approval details are unavailable"
				onretry={onretryTokens}
			/>{/if}
		{#if tokenState === 'stale'}<InlineAlert
				tone="warn"
				message="Refresh failed. Showing the last loaded token balances."
				onretry={onretryTokens}
			/>{/if}
		{#if tokenState === 'error'}<InlineAlert
				message={`Token balances unavailable${tokenError ? ': ' + tokenError : ''}`}
				onretry={onretryTokens}
			/>
		{:else}<DataTable
				{columns}
				rows={tokenRows}
				rowKey={(r) => r.key}
				rowName={(r) => r.token.name}
				caption="Page address token holdings"
				id="ds-holdings-tokens"
				density="compact"
				bind:sort={tokenSort}
				limit={tokensExpanded ? undefined : 10}
				moreLabel={(n) => `Show ${n} more tokens`}
				{detail}
				state={tableState}
				{asOf}
				emptyText={tokens.some((t) => !t.poolInfo) && !showDust
					? 'No tokens above the dust threshold. Show dust.'
					: 'No tokens in this account'}
			/>{/if}
		{#if !tokensExpanded && display.rows.tokens.length > 10}
			<Button variant="ghost" onclick={() => (tokensExpanded = true)}
				>Show {display.rows.tokens.length - 10} more tokens</Button
			>
		{/if}
		<div class="mt-4 min-w-0">{@render claims?.()}</div>
	</Card>
	<Card title="Liquidity positions" span={{ lg: 12, md: 2 }}>
		{#if tokenState === 'error'}<InlineAlert
				message="Token balances unavailable"
				onretry={onretryTokens}
			/>
		{:else}<DataTable
				columns={lpColumns}
				rows={display.rows.lp}
				rowKey={(r) => r.key}
				rowName={(r) => r.token.name}
				caption="Page address liquidity positions"
				id="ds-holdings-lp"
				density="compact"
				bind:sort={lpSort}
				{detail}
				state={tableState}
				{asOf}
				emptyText="No liquidity positions"
			/>{/if}
	</Card>
	<WalletNfts
		{pageAddress}
		tokens={nfts}
		state={nftState}
		partial={nftPartial}
		metadataLoading={nftMetadataLoading}
		onexpand={onnfts}
		onretry={onretryNfts}
	/>
</div>

<style>
	/* Coupled deliberately to frozen 0402a41 markup. The Chromium fixture pins every target. */
	:global(
		.wallet-token-legacy
			> div:first-of-type
			> div:first-of-type
			> div:first-of-type
			> div:nth-of-type(2)
			> div:nth-of-type(2)
	),
	:global(
		.wallet-token-legacy
			> div:first-of-type
			> div:first-of-type
			> div:first-of-type
			> div:nth-of-type(2)
			> div:first-of-type
			> span
	),
	:global(
		.wallet-token-legacy[data-lp]
			> div:first-of-type
			> div:first-of-type
			> div:nth-of-type(2)
			> div:first-of-type
	),
	:global(.wallet-claim-legacy > div:first-of-type > div:nth-of-type(2)) {
		display: none;
	}
	:global(.wallet-token-legacy),
	:global(.wallet-claim-legacy) {
		min-width: 0;
		max-width: 100%;
	}
	:global(.wallet-token-legacy > div:first-of-type),
	:global(.wallet-claim-legacy > div:first-of-type) {
		min-width: 0;
		max-width: 100%;
		background: rgb(var(--c-surface-2));
		color: rgb(var(--c-ink));
	}
	:global(.wallet-token-legacy > div:first-of-type > div:first-of-type) {
		width: 100%;
		margin-left: 0;
	}
	:global(.wallet-token-legacy > div:first-of-type > div:first-of-type > div:last-of-type) {
		flex-wrap: wrap;
		max-width: 100%;
	}
	:global(.wallet-token-legacy > div:first-of-type > div:first-of-type > div:first-of-type) {
		min-width: 0;
		max-width: 100%;
		flex-wrap: wrap;
	}
</style>
