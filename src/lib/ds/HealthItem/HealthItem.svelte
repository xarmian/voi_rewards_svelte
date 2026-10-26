<script lang="ts">
	import { glyphs, toneClasses, type Tone } from '../types';
	let {
		tone,
		title,
		detail,
		size = 'md',
		onHero = false
	}: {
		tone: Tone;
		title: string;
		detail?: string;
		size?: 'sm' | 'md';
		onHero?: boolean;
	} = $props();
</script>

<li
	class="flex items-start gap-2.5 {size === 'sm' ? 'py-1' : 'py-2'} {onHero
		? 'text-on-hero'
		: 'text-ink'}"
>
	<span
		aria-hidden="true"
		class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-ds-xs text-micro {onHero
			? 'bg-on-hero-surface text-on-hero'
			: toneClasses[tone]}">{glyphs[tone].health}</span
	>
	<div class="min-w-0">
		<p class="text-sm font-bold">{title}</p>
		{#if detail}<p class="text-label {onHero ? 'text-on-hero-muted' : 'text-ink-muted'}">
				{detail}
			</p>{/if}
	</div>
</li>
