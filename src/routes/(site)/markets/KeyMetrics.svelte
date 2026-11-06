<script lang="ts">
	import { StatTile } from '$lib/ds';
	import { formatCurrency, formatNumber } from '$lib/markets/format';
	import type { UniqueToken } from '../../api/tokens/+server';

	interface Props {
		selectedToken: UniqueToken | null;
		fetchingMarketData: boolean;
		totalVolume24h: number | null;
		totalTvlAll: number | null;
		circulatingMarketCap: number | null;
		tokenTotalSupplyAdjusted: number | null;
		fullyDilutedMarketCap: number;
		// TASK-107: null when the circulating-supply upstream failed; rendered as "—".
		realCirculatingSupply: { circulatingSupply: number; percentDistributed: number } | null;
		activeMarketsCount: number | null;
		realMarketData: { exchange: string }[];
	}

	let {
		selectedToken,
		fetchingMarketData,
		totalVolume24h,
		totalTvlAll,
		circulatingMarketCap,
		tokenTotalSupplyAdjusted,
		fullyDilutedMarketCap,
		realCirculatingSupply,
		activeMarketsCount,
		realMarketData
	}: Props = $props();

	let state: 'loading' | 'ready' = $derived(fetchingMarketData ? 'loading' : 'ready');
	let isVoi = $derived((selectedToken?.symbol || 'VOI') === 'VOI');
	let marketCap = $derived(
		isVoi
			? circulatingMarketCap === null
				? '—'
				: formatCurrency(circulatingMarketCap)
			: tokenTotalSupplyAdjusted != null
				? formatCurrency(fullyDilutedMarketCap)
				: '-'
	);
	let supply = $derived(
		isVoi
			? `Circulating: ${realCirculatingSupply ? formatNumber(realCirculatingSupply.circulatingSupply, 0) : '—'}`
			: `Total Supply: ${tokenTotalSupplyAdjusted != null ? formatNumber(tokenTotalSupplyAdjusted, 0) : '—'}`
	);
	let exchanges = $derived(
		`Across ${new Set(realMarketData.map((m) => m.exchange)).size} exchanges`
	);
</script>

<div class="grid grid-cols-1 gap-bento md:grid-cols-2 lg:grid-cols-4">
	<StatTile
		label="24h Volume"
		value={totalVolume24h === null ? '—' : formatCurrency(totalVolume24h)}
		{state}
	/>
	<StatTile
		label="Total TVL"
		value={totalTvlAll === null ? '—' : formatCurrency(totalTvlAll)}
		{state}
	/>
	<div class="min-w-0">
		<StatTile label={isVoi ? 'Market Cap' : 'FDV'} value={marketCap} detail={supply} {state} />
		{#if fetchingMarketData || marketCap === '—'}
			<p class="mt-2 text-label text-ink-muted">{supply}</p>
		{/if}
	</div>
	<div class="min-w-0">
		<StatTile
			label="Active markets"
			value={activeMarketsCount === null ? '—' : String(activeMarketsCount)}
			detail={exchanges}
			{state}
		/>
		{#if !fetchingMarketData && activeMarketsCount === null}
			<p class="mt-2 text-label text-ink-muted">{exchanges}</p>
		{/if}
	</div>
</div>
