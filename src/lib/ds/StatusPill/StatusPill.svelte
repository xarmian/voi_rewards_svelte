<script lang="ts">
	import { glyphs, toneClasses, type Tone } from '../types';
	let {
		tone,
		label,
		size = 'sm',
		onHero = false,
		visualLabel
	}: {
		tone: Tone;
		label: string;
		size?: 'sm' | 'md';
		onHero?: boolean;
		/** Optional visual wording; label remains the text read by assistive technology. */
		visualLabel?: string;
	} = $props();
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-full px-2.5 text-micro {size === 'sm'
		? 'py-1'
		: 'py-1.5'} {onHero ? 'bg-on-hero-surface text-on-hero' : toneClasses[tone]}"
>
	<span aria-hidden="true">{glyphs[tone].pill}</span>
	{#if visualLabel}<span aria-hidden="true">{visualLabel}</span><span class="sr-only">{label}</span
		>{:else}{label}{/if}
</span>
