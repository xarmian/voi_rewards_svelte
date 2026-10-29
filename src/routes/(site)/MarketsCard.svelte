<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Card, InlineAlert } from '$lib/ds';
	import { usd } from '$lib/ds/format';
	import type { Markets } from '$lib/home/markets';
	import type { Loaded } from '$lib/server/home';
	// A settled value also permits synchronous SSR of the streamed result's markup.
	let { markets }: { markets: Promise<Loaded<Markets>> | Loaded<Markets> } = $props();
</script>

{#snippet actions()}<a href="/markets" class="text-label text-accent"
		>All<span aria-hidden="true"> →</span><span class="sr-only"> markets</span></a
	>{/snippet}
<Card title="Markets" {actions}>
	{#await markets}
		<div aria-busy="true">
			<p class="sr-only">Loading markets…</p>
			{#each [0, 1, 2, 3] as row (row)}<div
					aria-hidden="true"
					class="mb-3 h-8 rounded-ds-xs bg-surface-2"
				></div>{/each}
		</div>
	{:then loaded}
		{#if loaded.state === 'error'}
			<InlineAlert message="Unable to load markets." onretry={invalidateAll} />
		{:else}
			<table class="w-full text-sm text-ink">
				<caption class="sr-only">Largest VOI markets by TVL</caption>
				<thead
					><tr class="border-b border-line text-micro text-ink-muted">
						<th scope="col" class="px-[5px] py-2.5 text-start md:px-2.5">Market</th>
						<th scope="col" class="px-[5px] py-2.5 text-end md:px-2.5">Price</th>
						<th scope="col" class="hidden px-2.5 py-2.5 text-end md:table-cell">TVL</th>
					</tr></thead
				>
				<tbody>
					{#each loaded.value.rows as row (row.trading_pair_id)}
						<tr class="border-b border-line last:border-b-0">
							<td class="break-words px-[5px] py-2.5 md:px-2.5"
								>{row.exchange} <span class="text-ink-muted">{row.pair} · {row.network}</span></td
							>
							<td class="num px-[5px] py-2.5 text-end md:px-2.5">{usd(row.price)}</td>
							<td class="num hidden px-2.5 py-2.5 text-end md:table-cell"
								>{usd(Math.round(row.tvl)).replace(/\.00$/, '')}</td
							>
						</tr>
					{:else}<tr><td colspan="3" class="py-2.5 text-ink-muted">No market data available</td></tr
						>{/each}
				</tbody>
			</table>
			<p class="mt-3 text-label text-ink-muted">
				24h volume {usd(loaded.value.volume24h)} · total liquidity {usd(loaded.value.liquidity)}
			</p>
		{/if}
	{:catch}
		<InlineAlert message="Unable to load markets." onretry={invalidateAll} />
	{/await}
</Card>
