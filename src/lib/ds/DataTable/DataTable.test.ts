import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import DataTable from './DataTable.svelte';
import type { Column } from './types';
import { detailsId } from './ids';

type Row = { name: string; blocks: number; share: number; reward: number };
const rows: Row[] = [
	{ name: 'Alpha', blocks: 2, share: 20, reward: 30 },
	{ name: 'Beta', blocks: 9, share: 80, reward: 70 }
];
const columns: Column<Row>[] = [
	{ key: 'name', header: 'Proposer', priority: 1 },
	{
		key: 'blocks',
		header: 'Blocks',
		numeric: true,
		sortable: true,
		sortValue: (r) => r.blocks,
		priority: 1
	},
	{ key: 'share', header: 'Share', numeric: true, priority: 2 },
	{ key: 'reward', header: 'Reward', numeric: true, priority: 3 }
];
const props = {
	rows,
	columns,
	rowKey: (r: Row) => r.name,
	rowName: (r: Row) => r.name,
	caption: 'Earning'
};
const html = (extra = {}) =>
	render(DataTable<Row>, { props: { ...props, ...extra } }).body.replace(/<!--[\s\S]*?-->/g, '');
function contentText(markup: string): string {
	const hidden: boolean[] = [];
	let text = '';
	for (const token of markup.match(/<[^>]+>|[^<]+/g) ?? []) {
		if (token.startsWith('</')) hidden.pop();
		else if (token.startsWith('<'))
			hidden.push(Boolean(hidden.at(-1)) || /\baria-hidden="true"/.test(token));
		else if (!hidden.at(-1)) text += token;
	}
	return text.replace(/\s+/g, ' ').trim();
}
function noNestedControls(markup: string) {
	const stack: string[] = [];
	for (const match of markup.matchAll(/<(\/?)(button|a)\b[^>]*>/g)) {
		if (match[1]) assert.equal(stack.pop(), match[2]);
		else {
			assert.equal(stack.length, 0, 'interactive controls must not nest');
			stack.push(match[2]);
		}
	}
	assert.equal(stack.length, 0);
}
describe('DataTable SSR', () => {
	test('semantic caption, column headers, numeric cells and no scrolling wrappers', () => {
		const body = html();
		assert.match(body, /<table\b/);
		assert.match(body, /<caption[^>]*>Earning<\/caption>/);
		for (const th of body.match(/<th\b[^>]*>/g) ?? []) assert.match(th, /scope="col"/);
		assert.match(body, /<td[^>]*class="[^"]*text-end[^"]*num[^"]*"[^>]*>\s*2\s*<\/td>/);
		assert.doesNotMatch(body, new RegExp(['over', 'flow-'].join('')));
		assert.match(html({ captionHidden: true }), /<caption[^>]*class="sr-only"/);
	});
	test('only the active header has aria-sort and sorted rows precede limiting', () => {
		const body = html({
			sort: { key: 'blocks', dir: 'desc' },
			limit: 1,
			moreLabel: (n: number) => `Show ${n}`
		});
		assert.equal((body.match(/aria-sort=/g) ?? []).length, 1);
		assert.match(body, /<th[^>]*aria-sort="descending"[^>]*>\s*<button[^>]*>\s*Blocks/);
		assert.match(body, /Beta/);
		assert.doesNotMatch(body, /Alpha/);
		const all = contentText(html({ sort: { key: 'blocks', dir: 'desc' } }));
		assert.ok(all.indexOf('Beta') < all.indexOf('Alpha'));
		assert.doesNotMatch(html(), /aria-sort=/);
		assert.match(html(), /<p[^>]*aria-live="polite"[^>]*>\s*<\/p>/);
	});
	test('priority visibility applies to headers and cells', () => {
		const body = html();
		for (const tag of ['th', 'td']) {
			assert.match(body, new RegExp(`<${tag}[^>]*class="[^"]*hidden lg:table-cell`));
			assert.match(body, new RegExp(`<${tag}[^>]*class="[^"]*hidden md:table-cell`));
		}
	});
	test('disclosures are named, closed, responsive and have stable targets', () => {
		const body = html({ expandable: true });
		for (const row of rows) {
			assert.ok(contentText(body).includes(`Details for ${row.name}`));
			const id = detailsId('ds-table-earning', row.name);
			assert.ok(body.includes(`aria-controls="${id}"`));
			assert.ok(body.includes(`id="${id}"`));
		}
		assert.equal((body.match(/aria-expanded="false"/g) ?? []).length, 2);
		assert.match(body, /<td[^>]*class="[^"]*lg:hidden/);
		assert.doesNotMatch(html({ expandable: true, columns: columns.slice(0, 2) }), /aria-expanded/);
	});
	test('detail snippets have all-viewport disclosures and follow the hidden-column list', () => {
		const detail = createRawSnippet<[Row]>((row) => ({
			render: () => `<p>Detail for ${row().name}</p>`
		}));
		const body = html({ detail });
		for (const cell of body.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []) {
			if (cell.includes('aria-expanded='))
				assert.doesNotMatch(cell.split('>')[0], /lg:hidden|md:hidden/);
		}
		assert.match(body, /<dl[\s\S]*?<\/dl>\s*<p>Detail for Alpha<\/p>/);
		assert.match(html({ detail, columns: columns.slice(0, 2) }), /Details for Alpha/);
		assert.doesNotMatch(html({ columns: columns.slice(0, 2) }), /aria-expanded/);
	});
	test('97 rows start with 15 and a correctly named expansion control', () => {
		const body = html({
			rows: Array.from({ length: 97 }, (_, n) => ({ ...rows[0], name: `Row ${n}` })),
			limit: 15,
			moreLabel: (n: number) => `Show ${n} more`
		});
		const tbody = body.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)![1];
		assert.equal((tbody.match(/<tr\b/g) ?? []).length, 16);
		assert.match(body, /<button[^>]*aria-expanded="false"[^>]*>Show 82 more<\/button>/);
	});
	test('row actions and favourites expose names and states without nested controls', () => {
		const rowActions = createRawSnippet<[Row]>(() => ({
			render: () => '<button type="button" role="menuitem">Copy</button>'
		}));
		const cell = createRawSnippet<[Row]>((row) => ({
			render: () => `<a href="/wallet/${row().name}">${row().name}</a>`
		}));
		const body = html({
			rowActions,
			favourite: { pressed: (r: Row) => r.name === 'Alpha', ontoggle: () => {} },
			columns: [{ ...columns[0], cell }, ...columns.slice(1)]
		});
		assert.equal((body.match(/aria-haspopup="menu"/g) ?? []).length, 2);
		assert.equal((body.match(/aria-expanded="false"/g) ?? []).length, 2);
		assert.doesNotMatch(body, /role="menu"/);
		// A closed menu isn't rendered, so its trigger must not point at it (review r1).
		assert.doesNotMatch(body, /aria-haspopup="menu"[^>]*aria-controls=|aria-controls="[^"]*-menu-/);
		assert.match(body, /aria-pressed="true"/);
		assert.match(body, /aria-pressed="false"/);
		for (const r of rows) {
			assert.ok(contentText(body).includes(`Actions for ${r.name}`));
			assert.ok(contentText(body).includes(`Favourite ${r.name}`));
		}
		noNestedControls(body);
		assert.doesNotMatch(body, /<(?:tr|td)[^>]*(?:role="button"|tabindex="0")/);
	});
	test('the default cell renders missing values as the em dash, not null or undefined', () => {
		const body = html({
			rows: [{ name: 'Gamma', blocks: 1, share: null, reward: undefined } as unknown as Row]
		});
		assert.doesNotMatch(contentText(body), /\bnull\b|\bundefined\b/);
		assert.ok((contentText(body).match(/—/g) ?? []).length >= 2);
	});

	test('loading uses five static skeleton rows and suppresses data', () => {
		const body = html({ state: 'loading' });
		assert.match(body, /<table[^>]*aria-busy="true"/);
		assert.ok(contentText(body).includes('Loading Earning…'));
		assert.equal(
			(body.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)![1].match(/<tr\b/g) ?? []).length,
			5
		);
		assert.match(body, /bg-grid/);
		assert.doesNotMatch(body, /Alpha|Beta|animate-/);
	});
	test('error uses InlineAlert, with retry only when provided, and no data', () => {
		const body = html({ state: 'error' });
		assert.match(body, /role="alert"/);
		assert.doesNotMatch(body, /Alpha|Beta|Retry/);
		assert.doesNotMatch(contentText(body), /0/);
		assert.match(html({ state: 'error', onretry: () => {} }), />Retry<\/button>/);
	});
	test('empty and stale states retain their meaning', () => {
		assert.match(html({ state: 'empty', emptyText: 'Nothing here' }), /Nothing here/);
		assert.doesNotMatch(html({ state: 'empty' }), /Alpha|Beta/);
		const body = html({ state: 'stale', asOf: '2026-10-25T00:00:00Z' });
		assert.match(body, /Alpha/);
		assert.match(body, /text-warn/);
		assert.ok(contentText(body).includes('as of'));
	});
});
