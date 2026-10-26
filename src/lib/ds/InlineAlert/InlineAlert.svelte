<script lang="ts">
	import Button from '../Button/Button.svelte';
	import { glyphs, toneClasses } from '../types';
	let {
		message,
		tone = 'danger',
		onretry,
		retryLabel = 'Retry'
	}: {
		message: string;
		tone?: 'danger' | 'warn';
		onretry?: () => void;
		retryLabel?: string;
	} = $props();
</script>

<div
	role="alert"
	class="flex flex-wrap items-center gap-2 rounded-ds-sm p-3 text-sm {toneClasses[tone]}"
>
	<span aria-hidden="true">{glyphs[tone].pill}</span><span>{message}</span>
	{#if onretry}<Button variant="soft" size="sm" onclick={onretry}>{retryLabel}</Button>{/if}
</div>
