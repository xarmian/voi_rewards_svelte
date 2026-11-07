<script lang="ts">
	import { createEventDispatcher, tick, untrack } from 'svelte';
	import { leavesWidget, nextOptionIndex } from '$lib/a11y/keyboard';
	import { slide } from 'svelte/transition';
	import { Button, Chip } from '$lib/ds';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		tokenSelect: UniqueToken;
	}>();

	let {
		selectedToken = null,
		allTokens = [],
		disabled = false
	}: {
		selectedToken?: UniqueToken | null;
		allTokens?: UniqueToken[];
		disabled?: boolean;
	} = $props();

	let searchQuery = $state(
		untrack(() => (selectedToken?.symbol === 'VOI' ? '' : (selectedToken?.symbol ?? '')))
	);
	let dropdownOpen = $state(false);
	let root: HTMLDivElement;
	let suppressOpen = false;
	const uid = $props.id();
	const listId = `${uid}-results`;

	const inputEl = () => root?.querySelector('input');
	const options = () => root.querySelectorAll<HTMLButtonElement>('[data-token-option]');

	function focusInput() {
		suppressOpen = true;
		inputEl()?.focus();
		suppressOpen = false;
	}

	function closeOnEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !dropdownOpen) return false;
		event.preventDefault();
		event.stopPropagation();
		dropdownOpen = false;
		focusInput();
		return true;
	}

	async function handleInputKeydown(event: KeyboardEvent) {
		if (closeOnEscape(event)) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			dropdownOpen = true;
			await tick();
			options()[0]?.focus();
		}
	}

	function handleOptionKeydown(event: KeyboardEvent, index: number) {
		if (closeOnEscape(event)) return;
		if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
			event.preventDefault();
			const next = nextOptionIndex(index, filteredTokens.length, event.key);
			if (next === -1) focusInput();
			else options()[next]?.focus();
		}
	}

	// Filter tokens based on search query
	let filteredTokens = $derived(
		searchQuery.trim()
			? allTokens
					.filter(
						(token) =>
							token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
							token.id.toString().includes(searchQuery)
					)
					.slice(0, 20)
			: allTokens.slice(0, 10)
	); // Show first 10 tokens when no search

	// Keyboard picks (click detail 0) return focus to the input; pointer picks leave the input,
	// as before, so a touch keyboard closes (TASK-39 r2).
	function afterPick(event?: MouseEvent) {
		if (event && event.detail > 0) inputEl()?.blur();
		else focusInput();
	}

	// Handle token selection
	function selectToken(token: UniqueToken, event?: MouseEvent) {
		dispatch('tokenSelect', token);
		searchQuery = '';
		dropdownOpen = false;
		afterPick(event);
	}

	// Reset to VOI
	function resetToVOI(event?: MouseEvent) {
		const voiToken = {
			id: 0,
			symbol: 'VOI',
			decimals: 6,
			type: 'VOI' as const,
			poolCount: 0
		};
		dispatch('tokenSelect', voiToken);
		searchQuery = '';
		dropdownOpen = false;
		afterPick(event);
	}

	// Programmatic focus after selection or Escape must not reopen the results.
	function handleFocus() {
		if (!suppressOpen) dropdownOpen = true;
	}

	// Clear search and reset to VOI
	function clearSearch(event?: MouseEvent) {
		searchQuery = '';
		resetToVOI(event);
	}

	// Update search query when selected token changes (but don't interfere with user typing)
	$effect(() => {
		if (selectedToken && !dropdownOpen) {
			searchQuery = selectedToken.symbol === 'VOI' ? '' : selectedToken.symbol;
		}
	});
</script>

<div
	class="relative w-full"
	bind:this={root}
	onfocusout={(event) => {
		if (leavesWidget(root, event.relatedTarget)) dropdownOpen = false;
	}}
>
	<label for={uid} class="mb-1 block text-label text-ink">Search tokens</label>
	<div class="flex flex-wrap items-center gap-2">
		<input
			id={uid}
			type="text"
			bind:value={searchQuery}
			onfocus={handleFocus}
			onclick={() => (dropdownOpen = true)}
			oninput={() => (dropdownOpen = true)}
			onkeydown={handleInputKeydown}
			aria-label="Search tokens"
			aria-controls={dropdownOpen && !disabled ? listId : undefined}
			placeholder="Search tokens (e.g., USDC, ALGO, 12345)"
			{disabled}
			class="min-h-10 w-full min-w-0 flex-1 rounded-ds-sm border border-edge bg-surface px-3 py-2 text-ink placeholder:text-ink-muted [@media(pointer:coarse)]:min-h-11"
		/>
		{#if searchQuery}
			<Button
				variant="ghost"
				size="sm"
				onclick={clearSearch}
				title="Clear search"
				aria-label="Clear search"
			>
				<i class="fas fa-times" aria-hidden="true"></i>
			</Button>
		{/if}
		{#if selectedToken && selectedToken.symbol !== 'VOI'}
			<Button
				variant="ghost"
				size="sm"
				onclick={resetToVOI}
				title="Reset to VOI"
				aria-label="Reset to VOI"
			>
				<i class="fas fa-undo" aria-hidden="true"></i>
			</Button>
		{/if}
	</div>

	<!-- Dropdown -->
	{#if dropdownOpen && !disabled}
		<div
			id={listId}
			role="group"
			aria-label="Token results"
			class="absolute z-50 mt-1 max-h-96 w-full overflow-y-auto rounded-ds-md border border-edge bg-surface text-ink shadow-card"
			transition:slide={{ duration: 200, axis: 'y' }}
		>
			{#if filteredTokens.length > 0}
				<!-- Header -->
				<div class="border-b border-edge bg-surface-2 px-4 py-2">
					<div class="text-label text-ink-muted">
						{searchQuery ? `Search Results (${filteredTokens.length})` : 'Popular Tokens'}
					</div>
				</div>

				<!-- Token List -->
				{#each filteredTokens as token, index}
					<button
						type="button"
						class="min-h-10 w-full border-b border-line px-4 py-3 text-left text-ink last:border-b-0 hover:bg-surface-2 [@media(pointer:coarse)]:min-h-11"
						data-token-option
						onmousedown={(event) => event.preventDefault()}
						onkeydown={(event) => handleOptionKeydown(event, index)}
						onclick={(event) => selectToken(token, event)}
					>
						<div class="flex items-center justify-between">
							<div class="flex min-w-0 items-center gap-3">
								<!-- Token Icon -->
								<div
									class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-ds-md bg-accent-soft text-accent"
								>
									{#if token.imageUrl}
										<img
											src={token.imageUrl}
											alt={token.symbol}
											class="w-full h-full object-cover"
											onerror={(e) => {
												// Fallback to symbol if image fails to load
												e.target.style.display = 'none';
												e.target.nextElementSibling.style.display = 'flex';
											}}
										/>
										<div
											class="hidden h-full w-full items-center justify-center text-sm font-bold text-accent"
										>
											{token.symbol.slice(0, 2)}
										</div>
									{:else}
										<div
											class="flex h-full w-full items-center justify-center text-sm font-bold text-accent"
										>
											{token.symbol.slice(0, 2)}
										</div>
									{/if}
								</div>

								<!-- Token Info -->
								<div class="min-w-0 break-words text-left">
									<div class="font-medium text-ink">
										{token.symbol}
									</div>
									<div class="text-micro text-ink-muted">
										ID: {token.id} • {token.decimals} decimals
									</div>
								</div>
							</div>

							<!-- Right side info -->
							<div class="flex flex-col items-end gap-1">
								<Chip tone="neutral" label={token.type} />
								<span class="text-micro text-ink-muted">
									{token.poolCount} pools
								</span>
							</div>
						</div>
					</button>
				{/each}
			{:else if searchQuery}
				<!-- No Results -->
				<div class="px-4 py-8 text-center text-ink-muted">
					<i class="fas fa-search mb-3 text-3xl text-ink-muted"></i>
					<p class="font-medium">No tokens found</p>
					<p class="text-sm mt-1">Try searching with a different symbol or token ID</p>
				</div>
			{:else}
				<!-- Loading or Empty State -->
				<div class="px-4 py-8 text-center text-ink-muted">
					<i class="fas fa-coins mb-3 text-3xl text-ink-muted"></i>
					<p class="font-medium">No tokens available</p>
					<p class="text-sm mt-1">Try refreshing the page</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
