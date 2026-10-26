<script lang="ts">
	import { comma } from '../format';
	import { toneClasses, type Tone } from '../types';
	let {
		label,
		count,
		tone = 'accent'
	}: { label: string; count?: number; tone?: 'accent' | Tone } = $props();
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-ds-xs px-2 py-1 text-micro {tone === 'accent'
		? 'bg-accent-soft text-accent'
		: toneClasses[tone]}"
	>{label}{#if count !== undefined}<span class="num">{comma(count)}</span>{/if}</span
>
