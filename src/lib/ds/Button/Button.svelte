<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Props = Omit<
		HTMLButtonAttributes & HTMLAnchorAttributes,
		'children' | 'onclick' | 'type'
	> & {
		variant?: 'primary' | 'soft' | 'ghost';
		size?: 'md' | 'sm';
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
	};
	let {
		variant = 'primary',
		size = 'md',
		href,
		type = 'button',
		disabled = false,
		onclick,
		children,
		class: className = '',
		...rest
	}: Props = $props();
	const variants = {
		primary: 'bg-primary-700 text-white',
		soft: 'bg-accent-soft text-accent',
		ghost: 'text-accent'
	};
	let classes = $derived(
		`inline-flex min-h-10 items-center justify-center gap-2 rounded-ds-sm font-bold transition-colors duration-fast ease-out-soft [@media(pointer:coarse)]:min-h-11 ${size === 'sm' ? 'px-3 py-2 text-label' : 'px-4 py-2.5 text-sm'} ${variants[variant]} ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`
	);
</script>

{#if href}
	<a
		{...rest}
		href={disabled ? undefined : href}
		role={disabled ? 'link' : rest.role}
		aria-disabled={disabled || undefined}
		tabindex={disabled ? -1 : rest.tabindex}
		class={classes}
		onclick={(event) => {
			if (disabled) event.preventDefault();
			else onclick?.(event);
		}}>{@render children()}</a
	>
{:else}
	<button {...rest} {type} {disabled} {onclick} class={classes}>{@render children()}</button>
{/if}
