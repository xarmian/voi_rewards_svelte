<script lang="ts">
	import StatusPill from '../StatusPill/StatusPill.svelte';
	import {
		BLOCK_REWARD_NOT_REGISTERED_TEXT,
		BLOCK_REWARD_REASON_SHORT,
		BLOCK_REWARD_STATUS_TEXT,
		type BlockRewardStatus
	} from '$lib/rewards/blockRewardStatus';

	let {
		status,
		compact = false
	}: {
		status: BlockRewardStatus;
		/** Short pill and reason label, with the full reasons behind a disclosure. */
		compact?: boolean;
	} = $props();
	const first = $derived(status.reasons[0]);
	const more = $derived(status.reasons.length - 1);
</script>

{#snippet reasons(extra = '')}
	<ul class="space-y-1 [overflow-wrap:anywhere] {extra}">
		{#each status.reasons as reason (reason.code)}<li>{reason.text}</li>{/each}
	</ul>
{/snippet}

{#if status.registered}
	<StatusPill
		tone="ok"
		label={BLOCK_REWARD_STATUS_TEXT.registered}
		visualLabel={compact ? 'Registered' : undefined}
	/>
{:else if compact}
	<div class="min-w-0 space-y-1">
		<StatusPill tone="warn" label={BLOCK_REWARD_NOT_REGISTERED_TEXT} visualLabel="Not registered" />
		{#if first}<details class="text-label">
				<summary class="cursor-pointer text-ink-muted"
					><span class="sr-only">Reasons: </span>{BLOCK_REWARD_REASON_SHORT[first.code]}{more > 0
						? ` +${more}`
						: ''}</summary
				>
				{@render reasons('mt-1 text-ink')}
			</details>{/if}
	</div>
{:else}
	<StatusPill tone="warn" label={BLOCK_REWARD_NOT_REGISTERED_TEXT} />
	{@render reasons('text-sm')}
{/if}
