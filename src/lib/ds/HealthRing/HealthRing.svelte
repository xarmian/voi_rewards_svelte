<script lang="ts">
	import { onMount } from 'svelte';
	import { ago, comma } from '../format';
	import type { DataState } from '../types';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import { ringArc } from './geometry';
	let {
		value,
		total,
		label = 'online',
		tone = 'ok',
		state: dataState = 'ready',
		onretry,
		asOf
	}: {
		value: number;
		total: number;
		label?: string;
		tone?: 'ok' | 'warn' | 'danger';
		state?: DataState;
		onretry?: () => void;
		asOf?: Date | number | string;
	} = $props();
	const strokes = { ok: 'stroke-ok', warn: 'stroke-warn', danger: 'stroke-danger' };
	let geometry = $derived(ringArc(value, total));
	let shownValue = $derived(Math.min(Math.max(0, total), Math.max(0, value)));
	let starting = $state(false);
	let animating = $state(false);
	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		starting = true;
		let second: number;
		let timeout: ReturnType<typeof setTimeout>;
		const first = requestAnimationFrame(() => {
			second = requestAnimationFrame(() => {
				animating = true;
				starting = false;
				timeout = setTimeout(() => {
					animating = false;
				}, 600);
			});
		});
		return () => {
			cancelAnimationFrame(first);
			cancelAnimationFrame(second);
			clearTimeout(timeout);
		};
	});
</script>

<div class="min-w-0" aria-busy={dataState === 'loading' ? 'true' : undefined}>
	{#if dataState === 'loading'}
		<span class="sr-only">Loading {label}…</span>
		<div aria-hidden="true" class="h-[110px] w-[110px] rounded-full bg-grid"></div>
	{:else if dataState === 'error'}
		<InlineAlert message="Unable to load {label}." {onretry} />
	{:else if dataState === 'empty'}
		<p class="flex min-h-[110px] items-center text-sm text-ink-muted">No data</p>
	{:else if total <= 0}
		<p class="flex min-h-[110px] items-center text-sm text-ink-muted">No contracts</p>
	{:else}
		<svg
			width="110"
			height="110"
			viewBox="0 0 110 110"
			role="img"
			aria-label="{comma(shownValue)} of {comma(total)} contracts {label}"
			focusable="false"
		>
			<circle cx="55" cy="55" r={geometry.r} fill="none" class="stroke-grid" stroke-width="12" />
			{#if shownValue > 0}<circle
					cx="55"
					cy="55"
					r={geometry.r}
					fill="none"
					class="{strokes[tone]} {animating
						? 'transition-[stroke-dashoffset] duration-slow ease-out-soft'
						: ''}"
					stroke-width="12"
					stroke-linecap="round"
					stroke-dasharray={geometry.circumference}
					stroke-dashoffset={starting ? geometry.circumference : geometry.dashOffset}
					transform="rotate(-90 55 55)"
				/>{/if}
			<text x="55" y="52" text-anchor="middle" class="num fill-ink text-[26px] font-black"
				>{comma(shownValue)}/{comma(total)}</text
			>
			<text x="55" y="70" text-anchor="middle" class="fill-ink-muted text-[11px] font-bold"
				>{label.toUpperCase()}</text
			>
		</svg>
	{/if}
	{#if dataState === 'stale'}
		<p class="mt-1 text-label text-warn"><span aria-hidden="true">!</span> as of {ago(asOf)}</p>
	{/if}
</div>
