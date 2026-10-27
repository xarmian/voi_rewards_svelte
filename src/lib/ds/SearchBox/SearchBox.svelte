<script module lang="ts">
	import type { Resolver } from './resolve';
	export type SearchBoxProps = {
		variant: 'hero' | 'compact';
		tone?: 'surface' | 'hero';
		collapsible?: boolean;
		collapseBelow?: 'md' | 'lg';
		placeholder?: string;
		buttonLabel?: string;
		examples?: { label: string; href: string }[];
		onsubmit: (address: string) => void;
		/** Supply distinct ids for multiple instances of the same variant. */
		id?: string;
		formLabel?: string;
		connected?: { address: string; name?: string }[];
		resolver?: Resolver;
	};
</script>

<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { errorClass, shouldCollapse } from './behavior';
	import Button from '../Button/Button.svelte';
	import { shortAddr } from '../format';
	import { createResolver, type Suggestion } from './resolve';
	let {
		variant,
		tone = 'surface',
		collapsible = true,
		collapseBelow = 'md',
		placeholder = 'Wallet address or enVoi name',
		buttonLabel = 'Check',
		examples = [],
		onsubmit,
		id = `ds-search-${variant}`,
		formLabel = variant === 'hero' ? 'Wallet search' : 'Header wallet search',
		connected = [],
		resolver = createResolver()
	}: SearchBoxProps = $props();
	let input: HTMLInputElement | undefined = $state();
	let toggle: HTMLButtonElement | undefined = $state();
	let widget: HTMLDivElement | undefined = $state();
	let text = $state('');
	let suggestions: Suggestion[] = $state([]);
	let picked: Suggestion | undefined = $state();
	let active = $state(-1);
	let open = $state(false);
	let revealed = $state(false);
	let error = $state('');
	let submitting = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let revision = 0;
	let submission = 0;
	function cancelSuggestions() {
		clearTimeout(timer);
		revision++;
	}
	function close() {
		cancelSuggestions();
		open = false;
		active = -1;
	}
	function requestSuggestions(delay = 0) {
		cancelSuggestions();
		if (error) {
			suggestions = [];
			open = false;
			return;
		}
		const version = revision;
		active = -1;
		const query = text.trim();
		if (!query) {
			const options: Suggestion[] = [
				...connected,
				...resolver.recents().map((address) => ({ address }))
			];
			suggestions = options.filter(
				(s, i) => options.findIndex((o) => o.address === s.address) === i
			);
			open = suggestions.length > 0;
			return;
		}
		suggestions = [];
		open = false;
		timer = setTimeout(async () => {
			let matches: Suggestion[];
			try {
				matches = await resolver.suggest(query);
			} catch {
				matches = [];
			}
			if (revision !== version) return;
			suggestions = matches;
			open = matches.length > 0;
		}, delay);
	}
	function changed(event: Event & { currentTarget: HTMLInputElement }) {
		text = event.currentTarget.value;
		submission++;
		submitting = false;
		picked = undefined;
		error = '';
		requestSuggestions(300);
	}
	function pick(option: Suggestion) {
		submission++;
		submitting = false;
		picked = option;
		text = option.name ?? option.address;
		error = '';
		close();
	}
	async function submit(option = picked) {
		if (submitting) return;
		close();
		error = '';
		submitting = true;
		const version = ++submission;
		const result = await resolver.resolve(text, option);
		if (version !== submission) return;
		submitting = false;
		if (result.ok) {
			if (
				shouldCollapse({
					compact: variant === 'compact',
					collapsible,
					revealed,
					leaving: false,
					hasError: Boolean(error),
					submitted: true
				})
			)
				revealed = false;
			resolver.remember(result.address);
			onsubmit(result.address);
		} else {
			close();
			error = result.message;
		}
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			escape(event);
			return;
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!open) requestSuggestions();
			if (suggestions.length) {
				open = true;
				active =
					active < 0
						? event.key === 'ArrowDown'
							? 0
							: suggestions.length - 1
						: (active + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) %
							suggestions.length;
			}
		} else if (event.key === 'Enter' && open && active >= 0) {
			event.preventDefault();
			const option = suggestions[active];
			pick(option);
			void submit(option);
		}
	}
	function escape(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (open) {
			event.preventDefault();
			close();
		} else if (variant === 'compact' && revealed) {
			event.preventDefault();
			revealed = false;
			toggle?.focus();
		} else cancelSuggestions();
	}
	function focusout(event: FocusEvent) {
		const leaving =
			!(event.relatedTarget instanceof Node) || !widget?.contains(event.relatedTarget);
		if (leaving) close();
		if (
			shouldCollapse({
				compact: variant === 'compact',
				collapsible,
				revealed,
				leaving,
				hasError: Boolean(error),
				submitted: false
			})
		)
			revealed = false;
	}
	$effect(() => {
		if (open && active >= 0) {
			widget
				?.querySelectorAll<HTMLElement>('[role="option"]')
				[active]?.scrollIntoView({ block: 'nearest' });
		}
	});
	onDestroy(() => {
		cancelSuggestions();
		submission++;
	});
</script>

<div bind:this={widget} onfocusout={focusout} class="min-w-0">
	{#if variant === 'compact' && collapsible}
		<button
			bind:this={toggle}
			type="button"
			aria-label="Search wallets"
			aria-expanded={revealed}
			aria-controls={`${id}-form`}
			class="flex h-10 w-10 items-center justify-center rounded-ds-sm {tone === 'hero'
				? 'text-on-hero bg-on-hero-surface'
				: 'text-accent'} {collapseBelow === 'lg' ? 'lg:hidden' : 'md:hidden'}"
			onclick={async () => {
				revealed = !revealed;
				if (revealed) {
					await tick();
					input?.focus();
				} else close();
			}}><span aria-hidden="true">⌕</span></button
		>
	{/if}
	<form
		id={`${id}-form`}
		role="search"
		aria-label={formLabel}
		class={variant === 'compact' && collapsible && !revealed
			? collapseBelow === 'lg'
				? 'hidden lg:block'
				: 'hidden md:block'
			: 'block'}
		onsubmit={(event) => {
			event.preventDefault();
			void submit(open && active >= 0 ? suggestions[active] : picked);
		}}
	>
		<div class="relative">
			<div
				class="flex min-w-0 items-center gap-2 p-2 {variant === 'hero'
					? 'hero-field rounded-ds-md border border-[#8b80ad] bg-white shadow-pop'
					: 'rounded-ds-sm border border-edge bg-surface text-ink'}"
			>
				<label for={`${id}-input`} class="sr-only">Wallet address or enVoi name</label>
				<input
					bind:this={input}
					value={text}
					id={`${id}-input`}
					type="text"
					autocomplete="off"
					spellcheck="false"
					autocapitalize="none"
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={open}
					aria-controls={`${id}-listbox`}
					aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
					aria-describedby={error ? `${id}-error` : undefined}
					aria-invalid={error ? 'true' : undefined}
					{placeholder}
					oninput={changed}
					onfocus={() => requestSuggestions()}
					onkeydown={keydown}
					class="min-h-10 w-full min-w-0 border-0 bg-transparent px-2 text-body {variant === 'hero'
						? 'text-[#1b1433] placeholder:text-[#665d86]'
						: 'text-ink placeholder:text-ink-muted'}"
				/>
				<Button type="submit" disabled={submitting} size="sm" onkeydown={escape}
					>{buttonLabel}</Button
				>
			</div>
			{#if open}
				<ul
					id={`${id}-listbox`}
					role="listbox"
					aria-label="Suggestions"
					onpointerdown={(event) => event.preventDefault()}
					class="absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-ds-sm border border-edge bg-surface p-1 text-ink shadow-pop"
				>
					{#each suggestions as option, index (`${option.address}-${index}`)}
						<!-- Keyboard selection belongs to the combobox input via aria-activedescendant. -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<li
							role="option"
							tabindex="-1"
							id={`${id}-opt-${index}`}
							aria-selected={active === index}
							class="flex cursor-pointer items-center gap-2 rounded-ds-xs p-3 text-sm {active ===
							index
								? 'bg-accent-soft'
								: ''}"
							onclick={() => pick(option)}
						>
							{#if option.avatar}<img
									src={option.avatar}
									alt=""
									class="h-8 w-8 rounded-full"
								/>{/if}
							<span
								>{#if option.name}<span class="block font-bold">{option.name}</span>{/if}<span
									class="num text-ink-muted">{shortAddr(option.address)}</span
								></span
							>
						</li>
					{/each}
				</ul>
			{/if}
			{#if error}<p id={`${id}-error`} role="alert" class={errorClass(variant, tone)}>
					{error}
				</p>{/if}
		</div>
	</form>
	{#if variant === 'hero' && examples.length}
		<p class="mt-3 flex flex-wrap gap-3 text-sm text-on-hero">
			<span>Try</span>{#each examples as example (example.href)}<a
					href={example.href}
					class="text-on-hero underline">{example.label}</a
				>{/each}
		</p>
	{/if}
</div>

<style>
	/* The hero field stays light, including focus outlines, in either page theme. */
	.hero-field :global(:focus-visible) {
		outline-color: #665d86;
	}
</style>
