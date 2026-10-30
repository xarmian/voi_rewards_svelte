<script lang="ts" generics="T">
	// The pinned ESLint parser does not register Svelte's generics attribute.
	/* global T */
	import { tick, type Snippet } from 'svelte';
	import Button from '../Button/Button.svelte';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import { ago } from '../format';
	import { slug } from '../slug';
	import type { DataState } from '../types';
	import RowMenu from './RowMenu.svelte';
	import { tableId, detailsId } from './ids';
	import { cellText, focusColumnIndex, sortRows, visibleRows } from './sort';
	import type { Column, SortState } from './types';

	let {
		columns,
		rows,
		rowKey,
		caption,
		captionHidden = false,
		rowName,
		sort = $bindable(),
		density = 'comfortable',
		limit,
		moreLabel,
		lessLabel = 'Show fewer',
		rowActions,
		favourite,
		expandable = false,
		detail,
		ondetails,
		state: dataState = 'ready',
		onretry,
		asOf,
		emptyText = 'No data',
		stickyHeader = true,
		id
	}: {
		columns: Column<T>[];
		rows: T[];
		/** Keys must be stable, and unique after slugging for disclosure/menu ids. */
		rowKey: (row: T) => string;
		caption: string;
		captionHidden?: boolean;
		/** Required with expandable, detail, rowActions or favourite. */
		rowName?: (row: T) => string;
		sort?: SortState;
		density?: 'comfortable' | 'compact';
		limit?: number;
		/** Required with limit; receives the number of rows hidden when collapsed. */
		moreLabel?: (hidden: number) => string;
		lessLabel?: string;
		/** Render native <button type="button" role="menuitem"> items. */
		rowActions?: Snippet<[T]>;
		favourite?: { pressed: (row: T) => boolean; ontoggle: (row: T) => void };
		expandable?: boolean;
		detail?: Snippet<[T]>;
		/** Called when a row's details open or close. Every detail is rendered while hidden,
		 * so this is where a caller starts lazy work for one row. */
		ondetails?: (row: T, open: boolean) => void;
		state?: DataState;
		onretry?: () => void;
		asOf?: Date | number | string;
		emptyText?: string;
		stickyHeader?: boolean;
		/** Defaults to ds-table- + slug(caption). Keep captions unique on a page or pass id. */
		id?: string;
	} = $props();

	let expanded = $state(false);
	let expandedKeys = $state<string[]>([]);
	let openMenu = $state<{ key: string; trigger: HTMLButtonElement }>();
	let announcement = $state('');
	let table: HTMLTableElement;
	let focusKey = $state<string>();
	let resolvedId = $derived(tableId(caption, id));
	let hiddenColumns = $derived(columns.filter((column) => column.priority > 1));
	// Focus target after "Show more": the first always-visible (priority 1) column; a priority 2/3
	// cell is display:none at narrow widths and can't take focus (review r1).
	let focusColumn = $derived(focusColumnIndex(columns));
	let disclosure = $derived(Boolean(detail) || (expandable && hiddenColumns.length > 0));
	let disclosureClass = $derived(
		detail ? '' : hiddenColumns.some((column) => column.priority === 3) ? 'lg:hidden' : 'md:hidden'
	);
	let colspan = $derived(
		columns.length + Number(Boolean(favourite)) + Number(Boolean(rowActions)) + Number(disclosure)
	);
	let padding = $derived(
		density === 'compact' ? 'py-1.5 px-[5px] md:px-2.5' : 'py-2.5 px-[5px] md:px-2.5'
	);
	let headerClass = $derived(
		`${padding} text-micro text-ink-muted ${stickyHeader ? 'sticky top-0 z-[1] bg-surface' : ''}`
	);
	let sorted = $derived.by(() => {
		const column = columns.find((column) => column.key === sort?.key && column.sortable);
		return column && sort ? sortRows(rows, column, sort.dir) : rows;
	});
	let shown = $derived(visibleRows(sorted, limit, expanded));
	let hiddenCount = $derived(limit === undefined ? 0 : Math.max(0, rows.length - limit));

	function name(row: T): string {
		if (!rowName) throw new Error('DataTable requires rowName for row controls.');
		return rowName(row);
	}
	function more(): string {
		if (!moreLabel) throw new Error('DataTable requires moreLabel with limit.');
		return moreLabel(hiddenCount);
	}
	function visibility(column: Column<T>): string {
		return column.priority === 3
			? 'hidden lg:table-cell'
			: column.priority === 2
				? 'hidden md:table-cell'
				: '';
	}
	function alignment(column: Column<T>): string {
		return `${(column.align ?? (column.numeric ? 'end' : 'start')) === 'end' ? 'text-end' : 'text-start'} ${column.numeric ? 'num' : ''}`;
	}
	function changeSort(column: Column<T>) {
		sort = {
			key: column.key,
			dir:
				sort?.key === column.key
					? sort.dir === 'desc'
						? 'asc'
						: 'desc'
					: column.numeric
						? 'desc'
						: 'asc'
		};
		announcement = `Sorted by ${column.header}, ${sort.dir === 'desc' ? 'descending' : 'ascending'}`;
		closeMenu(false);
	}
	function toggleDetails(row: T, key: string) {
		const open = !expandedKeys.includes(key);
		expandedKeys = open ? [...expandedKeys, key] : expandedKeys.filter((item) => item !== key);
		ondetails?.(row, open);
	}
	async function toggleMore() {
		const firstNewIndex = shown.length;
		expanded = !expanded;
		closeMenu(false);
		if (expanded && firstNewIndex < sorted.length) {
			focusKey = rowKey(sorted[firstNewIndex]);
			await tick();
			table.querySelector<HTMLElement>('[data-revealed-cell]')?.focus();
		} else focusKey = undefined;
	}
	function closeMenu(restoreFocus: boolean) {
		if (restoreFocus) openMenu?.trigger.focus();
		openMenu = undefined;
	}
	function toggleMenu(key: string, trigger: HTMLButtonElement) {
		openMenu = openMenu?.key === key ? undefined : { key, trigger };
	}
</script>

{#snippet cell(column: Column<T>, row: T)}
	{#if column.cell}{@render column.cell(row)}{:else}{cellText(
			(row as Record<string, unknown>)[column.key]
		)}{/if}
{/snippet}

{#if dataState === 'stale'}
	<p class="mb-2 text-label text-warn"><span aria-hidden="true">!</span> as of {ago(asOf)}</p>
{/if}
{#if dataState === 'loading'}<p class="sr-only">Loading {caption}…</p>{/if}
<table
	bind:this={table}
	id={resolvedId}
	aria-busy={dataState === 'loading' ? 'true' : undefined}
	class="w-full text-sm text-ink"
>
	<caption class={captionHidden ? 'sr-only' : 'pb-3 text-start text-label text-ink-muted'}
		>{caption}</caption
	>
	{#if dataState !== 'error'}
		<thead>
			<tr>
				{#if favourite}<th scope="col" class="w-7 {headerClass}"
						><span class="sr-only">Favourite</span></th
					>{/if}
				{#each columns as column (column.key)}
					<th
						scope="col"
						style:width={column.width}
						class="{headerClass} {visibility(column)} {alignment(column)}"
						aria-sort={sort?.key === column.key && column.sortable
							? sort.dir === 'desc'
								? 'descending'
								: 'ascending'
							: undefined}
					>
						{#if column.sortable}
							<button type="button" class="max-w-full" onclick={() => changeSort(column)}
								>{column.header}<span aria-hidden="true"
									>{sort?.key === column.key && sort.dir === 'asc' ? '▴' : '▾'}</span
								></button
							>
						{:else}{column.header}{/if}
					</th>
				{/each}
				{#if rowActions}<th scope="col" class="w-7 {headerClass}"
						><span class="sr-only">Actions</span></th
					>{/if}
				{#if disclosure}<th scope="col" class="w-7 {headerClass} {disclosureClass}"
						><span class="sr-only">Details</span></th
					>{/if}
			</tr>
		</thead>
		<tbody>
			{#if dataState === 'loading'}
				{#each [0, 1, 2, 3, 4] as skeleton (skeleton)}
					<tr aria-hidden="true" class="border-b border-line last:border-b-0">
						{#if favourite}<td class={padding}><div class="h-4 rounded-ds-xs bg-grid"></div></td
							>{/if}
						{#each columns as column (column.key)}<td class="{padding} {visibility(column)}"
								><div class="h-4 rounded-ds-xs bg-grid"></div></td
							>{/each}
						{#if rowActions}<td class={padding}><div class="h-4 rounded-ds-xs bg-grid"></div></td
							>{/if}
						{#if disclosure}<td class="{padding} {disclosureClass}"
								><div class="h-4 rounded-ds-xs bg-grid"></div></td
							>{/if}
					</tr>
				{/each}
			{:else if dataState === 'empty' || rows.length === 0}
				<tr><td {colspan} class="{padding} text-ink-muted">{emptyText}</td></tr>
			{:else}
				{#each shown as row, index (rowKey(row))}
					{@const key = rowKey(row)}
					{@const isExpanded = expandedKeys.includes(key)}
					{@const targetId = detailsId(resolvedId, key)}
					{@const menuId = `${resolvedId}-menu-${slug(key)}`}
					<tr
						class="hover:bg-surface-2 {index < shown.length - 1 || hiddenCount > 0
							? 'border-b border-line'
							: ''}"
					>
						{#if favourite}
							<td
								class={padding}
								tabindex={focusKey === key ? -1 : undefined}
								data-revealed-cell={focusKey === key ? '' : undefined}
							>
								<button
									type="button"
									aria-pressed={favourite.pressed(row)}
									class="text-accent"
									onclick={() => favourite?.ontoggle(row)}
									><span aria-hidden="true">{favourite.pressed(row) ? '★' : '☆'}</span><span
										class="sr-only">Favourite {name(row)}</span
									></button
								>
							</td>
						{/if}
						{#each columns as column, columnIndex (column.key)}
							<td
								class="{padding} {visibility(column)} {alignment(column)} break-words"
								tabindex={!favourite && columnIndex === focusColumn && focusKey === key
									? -1
									: undefined}
								data-revealed-cell={!favourite && columnIndex === focusColumn && focusKey === key
									? ''
									: undefined}
							>
								{@render cell(column, row)}
							</td>
						{/each}
						{#if rowActions}
							<td class="relative {padding}">
								<button
									type="button"
									aria-haspopup="menu"
									aria-expanded={openMenu?.key === key}
									aria-controls={openMenu?.key === key ? menuId : undefined}
									class="text-accent"
									onclick={(event) => toggleMenu(key, event.currentTarget)}
									><span aria-hidden="true">⋯</span><span class="sr-only"
										>Actions for {name(row)}</span
									></button
								>
								{#if openMenu?.key === key}<RowMenu
										id={menuId}
										name={name(row)}
										trigger={openMenu.trigger}
										onclose={closeMenu}>{@render rowActions(row)}</RowMenu
									>{/if}
							</td>
						{/if}
						{#if disclosure}
							<td class="{padding} {disclosureClass}">
								<button
									type="button"
									aria-expanded={isExpanded}
									aria-controls={targetId}
									class="text-accent"
									onclick={() => toggleDetails(row, key)}
									><span aria-hidden="true">{isExpanded ? '−' : '+'}</span><span class="sr-only"
										>Details for {name(row)}</span
									></button
								>
							</td>
						{/if}
					</tr>
					{#if disclosure}
						<tr id={targetId} hidden={!isExpanded} class={disclosureClass}>
							<td {colspan} class="{padding} break-words">
								{#if hiddenColumns.length > 0}
									<dl class="space-y-2">
										{#each hiddenColumns as column (column.key)}
											<div class={column.priority === 3 ? 'lg:hidden' : 'md:hidden'}>
												<dt class="text-micro text-ink-muted">{column.header}</dt>
												<dd class={column.numeric ? 'num' : ''}>{@render cell(column, row)}</dd>
											</div>
										{/each}
									</dl>
								{/if}
								{@render detail?.(row)}
							</td>
						</tr>
					{/if}
				{/each}
				{#if hiddenCount > 0}
					<tr
						><td {colspan} class="pt-2"
							><Button variant="ghost" aria-expanded={expanded} onclick={toggleMore}
								>{expanded ? lessLabel : more()}</Button
							></td
						></tr
					>
				{/if}
			{/if}
		</tbody>
	{/if}
</table>
{#if dataState === 'error'}<InlineAlert message="Unable to load {caption}." {onretry} />{/if}
<p class="sr-only" aria-live="polite">{announcement}</p>
