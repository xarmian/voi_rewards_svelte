<script lang="ts">
	import type { OnChainKeyregOffer } from '$lib/chain/keyreg';
	import { FALLBACK_BLOCK_TIME } from '$lib/chain/blockTime';

	// Offers an account that is online without the incentive fee a one-click re-registration of
	// the keys already on chain with the 2 VOI fee. The button runs only where the account can sign.
	let {
		offer,
		cost,
		canRegister,
		disabled,
		onRegister,
		now = Date.now()
	}: {
		offer: Extract<OnChainKeyregOffer, { kind: 'offer' }>;
		// What the wallet pays, in VOI.
		cost: number;
		canRegister: boolean;
		disabled: boolean;
		onRegister: () => void;
		now?: number;
	} = $props();

	let secondsLeft = $derived(offer.roundsLeft * FALLBACK_BLOCK_TIME);
	let endDate = $derived(
		new Date(now + secondsLeft * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' })
	);
	let daysLeft = $derived(Math.round(secondsLeft / 86_400));
</script>

<section
	aria-labelledby="onchain-eligibility-title"
	class="mb-6 p-4 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20"
>
	<h3 id="onchain-eligibility-title" class="text-base font-medium text-gray-900 dark:text-white">
		Make your current registration eligible
	</h3>
	<p class="mt-1 text-sm text-gray-700 dark:text-gray-300">
		Your keys are already registered on chain. Pay the 2 VOI incentive fee to re-register the same
		keys and become eligible for real-time block rewards. Your node stays online.
	</p>
	<p class="mt-2 text-xs text-gray-600 dark:text-gray-400">
		Keys valid until round {offer.keys.lastRound.toLocaleString()} (about {endDate})
	</p>
	<p class="mt-1 text-xs text-gray-600 dark:text-gray-400">
		This re-registers the keys on chain now. If your node has newer keys, register those instead.
	</p>
	{#if offer.expiringSoon}
		<p class="mt-2 text-xs text-amber-700 dark:text-amber-300">
			These keys end in about {daysLeft}
			{daysLeft === 1 ? 'day' : 'days'}. Paying 2 VOI for keys that end soon is a poor deal:
			consider generating new keys and registering them with the 2 VOI option below.
		</p>
	{/if}
	{#if canRegister}
		<div class="mt-3 flex justify-end">
			<button
				type="button"
				onclick={onRegister}
				{disabled}
				class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				<i class="fas fa-bolt" aria-hidden="true"></i>
				<span>Pay 2 VOI and re-register ({cost} VOI)</span>
			</button>
		</div>
	{/if}
</section>
