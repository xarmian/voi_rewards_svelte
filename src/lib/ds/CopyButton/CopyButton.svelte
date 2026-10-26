<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createCopyHandler, type CopyFeedback } from './copy';
	let { text, what, onHero = false }: { text: string; what: string; onHero?: boolean } = $props();
	let feedback = $state<CopyFeedback>({ status: 'idle', announcement: '' });
	const { copy, destroy } = createCopyHandler(feedback);
	onDestroy(destroy);
</script>

<button
	type="button"
	aria-label="Copy {what}"
	onclick={() => copy(text, what)}
	class="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-ds-xs px-2 text-sm [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 {onHero
		? 'bg-on-hero-surface text-on-hero'
		: 'bg-accent-soft text-accent'}"
>
	<span aria-hidden="true"
		>{feedback.status === 'copied' ? '✓' : feedback.status === 'failed' ? '!' : '⧉'}</span
	>
	{#if feedback.status === 'failed'}<span>Copy failed</span>{/if}
</button>
<span aria-live="polite" class="sr-only">{feedback.announcement}</span>
