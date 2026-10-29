<script lang="ts">
	import { untrack } from 'svelte';
	import type { UniqueToken } from '$lib/server/tokens';
	import { createLatestSearch } from './commandPalette';

	let {
		open = $bindable(false),
		onselect
	}: { open?: boolean; onselect: (token: UniqueToken) => void } = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();
	let query = $state('');
	let results: UniqueToken[] = $state([]);
	let recents: string[] = $state([]);
	let mostPools: UniqueToken[] = $state([]);
	let pending = $state(false);
	let failed = $state(false);
	let mostPoolsPending = $state(false);
	let mostPoolsFailed = $state(false);
	let active = $state(0);
	let mostPoolsRequested = false;
	let disposed = false;

	let searching = $derived(query.trim().length > 0);
	let recentRows = $derived(searching ? [] : recents.slice(0, 5));
	let tokenRows = $derived(
		(searching ? results : mostPools).filter(
			(token, index, tokens) => tokens.findIndex((other) => other.id === token.id) === index
		)
	);
	let rows = $derived([
		...recentRows.map((symbol, index) => ({
			id: `command-palette-recent-${index}`,
			symbol,
			token: null
		})),
		...tokenRows.map((token) => ({
			id: `command-palette-token-${token.id}`,
			symbol: token.symbol,
			token
		}))
	]);
	let activeId = $derived(rows[active]?.id);
	let loading = $derived(searching ? pending : mostPoolsPending);
	let error = $derived(searching ? failed : mostPoolsFailed);

	async function fetchTokens(url: string): Promise<UniqueToken[]> {
		const response = await fetch(url);
		if (!response.ok) throw new Error('Could not load tokens');
		const data: { tokens: UniqueToken[] } = await response.json();
		return data.tokens;
	}

	const search = createLatestSearch(
		(q: string) => fetchTokens(`/api/tokens?q=${encodeURIComponent(q)}`),
		{
			onResult(result) {
				pending = false;
				failed = result.status === 'error';
				if (result.status === 'success') {
					results = result.data;
					active = 0;
				}
			}
		}
	);

	function searchFor(value: string) {
		query = value;
		active = 0;
		failed = false;
		pending = value.trim().length > 0;
		if (pending) search.search(value.trim());
		else search.cancel();
	}

	async function loadMostPools() {
		mostPoolsPending = true;
		mostPoolsFailed = false;
		try {
			const tokens = await fetchTokens('/api/tokens?limit=5');
			if (!disposed) mostPools = tokens.slice(0, 5);
		} catch {
			if (!disposed) mostPoolsFailed = true;
		} finally {
			if (!disposed) mostPoolsPending = false;
		}
	}

	function prepareOpen() {
		searchFor('');
		results = [];
		try {
			const stored: unknown = JSON.parse(localStorage.getItem('commandPaletteRecents') ?? '[]');
			recents = Array.isArray(stored)
				? [...new Set(stored.filter((value): value is string => typeof value === 'string'))].slice(
						0,
						10
					)
				: [];
		} catch {
			recents = [];
		}
		if (!mostPoolsRequested) {
			mostPoolsRequested = true;
			void loadMostPools();
		}
	}

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			untrack(prepareOpen);
			dialog.showModal();
			input?.focus();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	$effect(() => {
		if (open && activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
	});

	$effect(() => {
		const mac = /Mac/i.test(navigator.platform);
		function shortcut(event: KeyboardEvent) {
			if (event.isComposing || event.defaultPrevented || open) return;
			if ((mac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				open = true;
			}
		}
		window.addEventListener('keydown', shortcut);
		return () => {
			window.removeEventListener('keydown', shortcut);
			search.cancel();
			disposed = true;
		};
	});

	function closed() {
		open = false;
		search.cancel();
		pending = false;
	}

	function close() {
		dialog?.close();
	}

	function backdrop(event: MouseEvent) {
		if (event.target !== dialog || !dialog) return;
		const bounds = dialog.getBoundingClientRect();
		if (
			event.clientX < bounds.left ||
			event.clientX > bounds.right ||
			event.clientY < bounds.top ||
			event.clientY > bounds.bottom
		)
			close();
	}

	function select(index: number) {
		const row = rows[index];
		if (!row) return;
		if (!row.token) {
			searchFor(row.symbol);
			input?.focus();
			return;
		}
		onselect(row.token);
		recents = [row.symbol, ...recents.filter((symbol) => symbol !== row.symbol)].slice(0, 10);
		try {
			localStorage.setItem('commandPaletteRecents', JSON.stringify(recents));
		} catch {
			// Selection still works when storage is unavailable.
		}
		close();
	}

	function navigate(event: KeyboardEvent) {
		if (event.isComposing || event.defaultPrevented) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			active = Math.max(
				0,
				Math.min(rows.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))
			);
		} else if (event.key === 'Enter' && rows[active]) {
			event.preventDefault();
			select(active);
		}
	}
</script>

<!-- Backdrop clicks are pointer-only; native dialog supplies Escape and restores focus. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialog}
	aria-label="Search tokens"
	onclose={closed}
	onclick={backdrop}
	class="mx-auto mb-0 mt-[10dvh] max-h-[80dvh] w-[calc(100%-2rem)] max-w-[640px] overflow-y-auto rounded-ds-sm border border-line bg-surface p-0 text-ink shadow-pop md:w-full"
>
	<div class="flex items-center gap-3 border-b border-line p-4">
		<svg
			class="h-5 w-5 shrink-0 text-accent"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" />
		</svg>
		<div class="min-w-0 flex-1">
			<label for="command-palette-query" class="sr-only">Search tokens</label>
			<input
				bind:this={input}
				id="command-palette-query"
				role="combobox"
				aria-expanded={open}
				aria-controls="command-palette-listbox"
				aria-activedescendant={activeId}
				aria-autocomplete="list"
				autocomplete="off"
				spellcheck="false"
				autocapitalize="none"
				placeholder="Search tokens"
				value={query}
				oninput={(event) => searchFor(event.currentTarget.value)}
				onkeydown={navigate}
				class="w-full rounded-ds-sm border border-edge bg-surface-2 px-3 py-2 text-body text-ink placeholder:text-ink-muted"
			/>
		</div>
		<button type="button" onclick={close} class="min-h-11 rounded-ds-sm px-2 text-label text-accent"
			>Close</button
		>
	</div>
	{#if loading}
		<p role="status" class="px-4 pt-3 text-label text-ink-muted">Loading tokens…</p>
	{/if}
	{#if error}
		<div class="flex items-center gap-3 px-4 pt-3">
			<p role="alert" class="text-body text-ink">Couldn't load tokens</p>
			<button
				type="button"
				class="min-h-11 rounded-ds-sm px-2 text-label text-accent"
				onclick={() => (searching ? searchFor(query) : loadMostPools())}>Retry</button
			>
		</div>
	{/if}
	<div
		id="command-palette-listbox"
		role="listbox"
		aria-label="Tokens"
		aria-busy={loading}
		class="p-2"
	>
		{#each rows as row, index (row.id)}
			{#if !searching && index === 0 && recentRows.length}
				<div role="presentation" class="px-3 py-2 text-label text-ink-muted">Recent</div>
			{/if}
			{#if !searching && index === recentRows.length}
				<div role="presentation" class="px-3 py-2 text-label text-ink-muted">Most pools</div>
			{/if}
			<button
				type="button"
				id={row.id}
				role="option"
				aria-selected={index === active}
				tabindex="-1"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => select(index)}
				class="flex min-h-11 w-full items-center gap-3 rounded-ds-sm px-3 py-3 text-left text-body {index ===
				active
					? 'bg-accent-soft text-ink'
					: 'text-ink hover:bg-surface-2'}"
			>
				{#if row.token?.imageUrl}
					<img
						src={row.token.imageUrl}
						width="24"
						height="24"
						alt=""
						loading="lazy"
						class="h-6 w-6 shrink-0"
						onerror={(event) => {
							(event.currentTarget as HTMLImageElement).style.display = 'none';
						}}
					/>
				{/if}
				<span class="min-w-0">
					<span class="block break-words font-bold">{row.symbol}</span>
					{#if row.token}
						<span class="block text-label text-ink-muted"
							>{row.token.type} · {row.token.poolCount} pools · ID {row.token.id}</span
						>
					{/if}
				</span>
			</button>
		{/each}
	</div>
	{#if !rows.length && !error}
		<p class="px-4 pb-4 text-body text-ink-muted">
			{searching ? (pending ? '' : 'No tokens found') : 'Type a token symbol'}
		</p>
	{/if}
	<footer
		class="flex flex-wrap gap-4 border-t border-line bg-surface-2 px-4 py-3 text-label text-ink-muted"
	>
		<span><kbd>↵</kbd> Select</span>
		<span><kbd>↑↓</kbd> Navigate</span>
		<span><kbd>Esc</kbd> Close</span>
	</footer>
</dialog>

<style>
	dialog {
		touch-action: pan-y;
	}
	dialog::backdrop {
		background: rgb(var(--c-ink) / 0.4);
	}
	kbd {
		border: 1px solid rgb(var(--c-line));
		background: rgb(var(--c-surface));
		padding: 0.125rem 0.25rem;
	}
</style>
