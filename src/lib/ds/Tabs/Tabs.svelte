<script module lang="ts">
	export type NavProps = {
		variant: 'nav';
		items: { id: string; label: string; href: string }[];
		current: string;
		label: string;
		onHero?: boolean;
	};
	export type SegmentedProps<V extends string = string> = {
		variant: 'segmented';
		options: { value: V; label: string }[];
		value: V;
		label: string;
		onchange?: (v: V) => void;
	};
</script>

<script lang="ts" generics="V extends string">
	// As in DataTable, the pinned ESLint parser does not register Svelte generics.
	/* global V */
	type Props =
		| (NavProps & { options?: never; value?: never; onchange?: never })
		| (SegmentedProps<V> & { items?: never; current?: never; onHero?: never });
	let {
		variant,
		items,
		current,
		label,
		onHero = true,
		options,
		value = $bindable(),
		onchange
	}: Props = $props();
	let track: HTMLUListElement | undefined = $state();
	let left = $state(false);
	let right = $state(false);
	let mask = $derived(
		left || right
			? `linear-gradient(to right, ${left ? 'transparent, rgb(var(--c-ink)) 24px' : 'rgb(var(--c-ink))'}, ${right ? 'rgb(var(--c-ink)) calc(100% - 24px), transparent' : 'rgb(var(--c-ink))'})`
			: 'none'
	);
	$effect(() => {
		const element = track;
		if (!element) return;
		const measure = () => {
			left = element.scrollLeft > 1;
			right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
		};
		measure();
		element.addEventListener('scroll', measure, { passive: true });
		const observer =
			typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
		observer?.observe(element);
		return () => {
			element.removeEventListener('scroll', measure);
			observer?.disconnect();
		};
	});
	$effect(() => {
		const id = current;
		const element = track;
		if (element && id) {
			const link = Array.from(element.querySelectorAll('a')).find((a) => a.dataset.item === id);
			link?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
		}
	});
</script>

{#if variant === 'nav'}
	<nav aria-label={label} class={onHero ? 'on-hero' : undefined}>
		<ul bind:this={track} class="flex max-w-full gap-1 overflow-x-auto p-1" style:mask-image={mask}>
			{#each items ?? [] as item (item.id)}
				<li class="shrink-0">
					<a
						href={item.href}
						data-item={item.id}
						aria-current={current === item.id ? 'page' : undefined}
						class="inline-flex min-h-10 items-center rounded-full px-4 text-sm font-bold {current ===
						item.id
							? onHero
								? 'bg-white text-[#5b21b6]'
								: 'bg-accent-soft text-accent'
							: onHero
								? 'text-on-hero-muted'
								: 'text-ink-muted'}">{item.label}</a
					>
				</li>
			{/each}
		</ul>
	</nav>
{:else}
	<div
		role="group"
		aria-label={label}
		class="flex w-fit max-w-full flex-wrap gap-1 rounded-full border border-edge bg-surface-2 p-1"
	>
		{#each options ?? [] as option (option.value)}
			<button
				type="button"
				aria-pressed={value === option.value}
				class="min-h-8 rounded-full px-3 text-label [@media(pointer:coarse)]:min-h-10 {value ===
				option.value
					? 'bg-surface text-ink shadow-card'
					: 'text-ink-muted'}"
				onclick={() => {
					value = option.value;
					onchange?.(option.value);
				}}>{option.label}</button
			>
		{/each}
	</div>
{/if}

<style>
	ul {
		scrollbar-width: none;
	}
	ul::-webkit-scrollbar {
		display: none;
	}
</style>
