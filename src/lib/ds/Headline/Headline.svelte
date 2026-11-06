<script lang="ts">
	import type { WalletSummary } from '$lib/wallet/summary';
	import { compact, pct, shortAddr } from '../format';
	import Button from '../Button/Button.svelte';
	let {
		account,
		summary,
		onretry
	}: {
		account: { name?: string; addr: string };
		summary: WalletSummary;
		onretry?: () => void;
	} = $props();
	const name = $derived(account.name || shortAddr(account.addr));
	const urgent = $derived(summary.keyDays !== null && summary.keyDays < 7);
	const earning = $derived(
		summary.onlineAccounts > 0 && !summary.tooEarly && summary.current.reward !== null
	);
</script>

{#snippet earnings()}
	{name} has <strong>{compact(summary.stakedOnline, 1)} VOI</strong> earning
	{#if summary.onlineContracts > 0}across {summary.onlineAccounts > summary.onlineContracts
			? 'the owner and '
			: ''}{summary.onlineContracts}
		{summary.onlineContracts === 1 ? 'contract' : 'contracts'}{:else}in this account{/if}, on track
	for
	<strong>≈{compact(summary.current.reward, 1)} VOI</strong> this epoch (<strong
		>{pct(summary.current.ratio === null ? null : summary.current.ratio * 100, 0)}</strong
	> of expected).
{/snippet}
{#snippet idle()}
	{name} has <strong>{compact(summary.idleBalance, 1)} VOI</strong> in contracts that aren't staking:
	register a key to earn.
{/snippet}

<p
	class="text-lede text-on-hero"
	aria-busy={summary.state === 'loading' ? 'true' : undefined}
	role={summary.state === 'error' || !summary.contractsReady ? 'alert' : undefined}
>
	{#if summary.state === 'loading'}
		<span class="sr-only">Loading staking data…</span><span
			aria-hidden="true"
			class="block h-6 max-w-xl rounded bg-on-hero-surface"
		></span>
	{:else if summary.state === 'error' || !summary.contractsReady}
		We couldn't load {name}'s staking data. {#if onretry}<Button
				variant="soft"
				size="sm"
				onclick={onretry}>Retry</Button
			>{/if}
	{:else if summary.contractCount === 0 && summary.onlineAccounts === 0}
		{name} isn't staking: no online key and no lock contracts.
	{:else if urgent}
		{name}'s participation key
		<strong
			>{summary.keyDays! <= 0
				? 'has expired'
				: `expires in ${Math.ceil(summary.keyDays!)} days`}</strong
		>: renew it to keep earning.
		{#if earning}{@render earnings()}{/if}
	{:else if earning}
		{@render earnings()}
		{#if summary.idleBalance > 0}{@render idle()}{/if}
	{:else if summary.onlineAccounts > 0 && summary.tooEarly}
		{name} has <strong>{compact(summary.stakedOnline, 1)} VOI</strong> online; it's too early in
		epoch {summary.current.epoch} to project rewards.
	{:else if summary.idleBalance > 0}
		{@render idle()}
	{:else}
		{name} has {compact(summary.stakedOnline, 1)} VOI online. A reward projection is not available yet.
	{/if}
</p>
