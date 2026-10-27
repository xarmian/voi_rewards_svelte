<script lang="ts">
	import { theme, setTheme } from '$lib/theme.svelte';

	let { class: className = 'text-ink-muted hover:text-ink' }: { class?: string } = $props();
</script>

<button
	type="button"
	class="ds-theme-toggle inline-flex shrink-0 items-center justify-center rounded-full {className}"
	onclick={() => setTheme(theme.current === 'dark' ? 'light' : 'dark')}
>
	<span class="ds-theme-to-dark">
		<svg
			class="h-5 w-5"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z" />
		</svg>
		<span class="sr-only">Switch to dark theme</span>
	</span>
	<span class="ds-theme-to-light">
		<svg
			class="h-5 w-5"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="4" />
			<path
				d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42m0-14.14-1.42 1.42M6.35 17.65l-1.42 1.42"
			/>
		</svg>
		<span class="sr-only">Switch to light theme</span>
	</span>
</button>

<style>
	.ds-theme-toggle {
		width: 40px;
		height: 40px;
	}

	@media (pointer: coarse) {
		.ds-theme-toggle {
			width: 44px;
			height: 44px;
		}
	}

	:global(:root.dark) .ds-theme-to-dark {
		display: none;
	}

	:global(:root:not(.dark)) .ds-theme-to-light {
		display: none;
	}
</style>
