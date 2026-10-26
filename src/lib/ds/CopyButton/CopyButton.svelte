<script lang="ts">
	import { onDestroy } from 'svelte';
	let { text, what, onHero = false }: { text: string; what: string; onHero?: boolean } = $props();
	let status = $state<'idle' | 'copied' | 'failed'>('idle');
	let timeout: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => clearTimeout(timeout));
	async function copy() {
		clearTimeout(timeout);
		try {
			if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText)
				throw new Error('Clipboard unavailable');
			await navigator.clipboard.writeText(text);
			status = 'copied';
			timeout = setTimeout(() => {
				status = 'idle';
			}, 1500);
		} catch {
			status = 'failed';
		}
	}
</script>

<button
	type="button"
	aria-label="Copy {what}"
	onclick={copy}
	class="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-ds-xs px-2 text-sm [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 {onHero
		? 'bg-on-hero-surface text-on-hero'
		: 'bg-accent-soft text-accent'}"
>
	<span aria-hidden="true">{status === 'copied' ? '✓' : status === 'failed' ? '!' : '⧉'}</span>
	{#if status === 'failed'}<span>Copy failed</span>{/if}
</button>
<span aria-live="polite" class="sr-only"
	>{status === 'copied' ? `Copied ${what}` : status === 'failed' ? 'Copy failed' : ''}</span
>
