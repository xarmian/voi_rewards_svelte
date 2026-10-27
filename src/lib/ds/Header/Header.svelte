<script lang="ts">
	import { goto } from '$app/navigation';
	import SearchBox from '../SearchBox/SearchBox.svelte';
	import ThemeToggle from '../ThemeToggle/ThemeToggle.svelte';
	import FreshnessBadge from './FreshnessBadge.svelte';
	import MobileMenu from './MobileMenu.svelte';
	import { navItems, type NavKey } from './nav';
	let {
		variant,
		current,
		epoch
	}: { variant: 'hero' | 'bar'; current: NavKey | null; epoch?: number } = $props();
	let open = $state(false);
	let menu: MobileMenu | undefined = $state();
	let menuButton: HTMLButtonElement | undefined = $state();
	const search = (address: string) => {
		void goto('/wallet/' + address);
	};
</script>

<header class="on-hero text-on-hero {variant === 'bar' ? 'bg-hero' : ''}">
	<div
		class="container-page relative grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 py-3 lg:flex"
	>
		<a
			href="#main"
			class="sr-only z-30 rounded-ds-sm bg-on-hero-surface p-2 text-on-hero focus:not-sr-only focus:absolute focus:left-4 focus:top-2"
			>Skip to content</a
		>
		<a href="/" class="min-w-0 font-black text-body lg:text-h2"
			><span aria-hidden="true">◆</span> voirewards</a
		>
		<nav aria-label="Main" class="hidden min-w-0 lg:block">
			<ul class="flex items-center gap-0.5 text-label lg:gap-1">
				{#each navItems as item (item.key)}
					<li>
						<a
							href={item.href}
							aria-current={current === item.key ? 'page' : undefined}
							class="block rounded-full px-2 py-2 transition-colors duration-fast ease-out-soft {current ===
							item.key
								? 'bg-on-hero-surface text-on-hero'
								: 'text-on-hero-muted hover:text-on-hero'}">{item.label}</a
						>
					</li>
				{/each}
			</ul>
		</nav>
		{#if current !== 'home'}
			<div class="header-search col-start-2 row-start-1 min-w-0 lg:flex-1">
				<SearchBox
					variant="compact"
					tone="hero"
					collapseBelow="lg"
					id="ds-search-header"
					formLabel="Header wallet search"
					onsubmit={search}
				/>
			</div>
		{/if}
		<div class="col-span-4 row-start-2 justify-self-start lg:ml-auto lg:max-w-none">
			<FreshnessBadge {variant} {epoch} />
		</div>
		<div class="col-start-3 row-start-1"><ThemeToggle class="text-on-hero" /></div>
		<button
			bind:this={menuButton}
			type="button"
			aria-expanded={open}
			aria-controls="site-menu"
			aria-label="Menu"
			onclick={() => menu?.show()}
			class="col-start-4 row-start-1 flex h-11 w-11 items-center justify-center rounded-ds-sm bg-on-hero-surface lg:hidden"
			><span aria-hidden="true">☰</span></button
		>
	</div>
</header>
<MobileMenu
	bind:this={menu}
	{current}
	onsubmit={search}
	onopenchange={(value) => {
		open = value;
		if (!value) menuButton?.focus();
	}}
/>

<style>
	/* TASK-65: surface search controls keep contrasting focus inside the hero. */
	.header-search :global(form :focus-visible) {
		outline-color: rgb(var(--c-focus));
	}
	@media (max-width: 1023px) {
		.header-search :global(form) {
			position: absolute;
			top: 100%;
			left: 16px;
			right: 16px;
			z-index: 20;
		}
	}
</style>
