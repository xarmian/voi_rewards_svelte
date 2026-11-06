import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('$lib/supabase', () => ({ supabasePublicClient: { from: mocks.from } }));

import type { IProject } from '$lib/data/types';
import {
	DIRECTORY_TIMEOUT_MS,
	directoryView,
	fetchDirectoryProjects,
	categoryHref,
	orderCategories,
	orderProjects,
	filterProjects,
	categoriesOf,
	nextFeedState,
	formatReceivedAt,
	type FeedState
} from './projects';

const select = vi.fn();
const abortSignal = vi.fn();
const projects = [
	{ id: 1, title: 'Kibisis', category: 'Wallets', status: 'active' },
	{ id: 2, title: 'Inactive project', category: 'Tools', status: 'inactive' }
];

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	mocks.from.mockReturnValue({ select });
	select.mockReturnValue({ abortSignal });
});

afterEach(() => vi.restoreAllMocks());

describe('fetchDirectoryProjects', () => {
	it.each([{ rows: projects }, { rows: [] }])(
		'returns a successful projects response (%j)',
		async ({ rows }) => {
			const timeout = vi.spyOn(AbortSignal, 'timeout');
			abortSignal.mockResolvedValue({ data: rows, error: null });

			await expect(fetchDirectoryProjects()).resolves.toEqual({ ok: true, projects: rows });
			expect(mocks.from.mock.calls).toEqual([['vr_projects']]);
			expect(select).toHaveBeenCalledWith('*');
			expect(DIRECTORY_TIMEOUT_MS).toBe(8000);
			expect(timeout).toHaveBeenCalledWith(DIRECTORY_TIMEOUT_MS);
			expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
			expect(console.error).not.toHaveBeenCalled();
		}
	);

	it('returns failure and logs once for a Supabase error', async () => {
		const error = { message: 'Projects unavailable' };
		abortSignal.mockResolvedValue({ data: null, error });

		await expect(fetchDirectoryProjects()).resolves.toEqual({ ok: false });
		expect(console.error).toHaveBeenCalledExactlyOnceWith(expect.any(String), error);
	});

	it('returns failure and logs once for a rejected query', async () => {
		const error = new Error('Network unavailable');
		abortSignal.mockRejectedValue(error);

		await expect(fetchDirectoryProjects()).resolves.toEqual({ ok: false });
		expect(console.error).toHaveBeenCalledExactlyOnceWith(expect.any(String), error);
	});

	it('returns failure and logs once if constructing the query throws', async () => {
		const error = new Error('Query construction failed');
		mocks.from.mockImplementation(() => {
			throw error;
		});

		await expect(fetchDirectoryProjects()).resolves.toEqual({ ok: false });
		expect(console.error).toHaveBeenCalledExactlyOnceWith(expect.any(String), error);
	});

	it('returns failure and logs once when the deadline signal aborts the query', async () => {
		const controller = new AbortController();
		vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
		abortSignal.mockImplementation(
			(signal: AbortSignal) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(signal.reason), { once: true });
				})
		);

		const pending = fetchDirectoryProjects();
		controller.abort();

		await expect(pending).resolves.toEqual({ ok: false });
		expect(abortSignal).toHaveBeenCalledWith(controller.signal);
		expect(console.error).toHaveBeenCalledExactlyOnceWith(
			expect.any(String),
			controller.signal.reason
		);
	});
});

describe('directoryView', () => {
	it.each([
		{ status: 'loading', total: 0, shown: 0, view: 'loading' },
		{ status: 'loading', total: 3, shown: 2, view: 'loading' },
		{ status: 'error', total: 0, shown: 0, view: 'error' },
		{ status: 'error', total: 3, shown: 2, view: 'error' },
		{ status: 'ok', total: 0, shown: 0, view: 'empty' },
		{ status: 'ok', total: 3, shown: 0, view: 'no-match' },
		{ status: 'ok', total: 3, shown: 2, view: 'list' }
	] as const)('shows $view for status=$status, total=$total, shown=$shown', ({ view, ...args }) => {
		expect(directoryView(args)).toBe(view);
	});
});

const row = (category: string, overrides: Partial<IProject> = {}): IProject => ({
	id: 1,
	title: `${category} project`,
	description: 'Build something useful',
	category,
	status: 'active',
	type: 'project',
	quests: [],
	...overrides
});
const rows = [
	row('Payments', { title: 'Fast Pay', new: true }),
	row('Wallets', { description: 'Store your TOKENS' }),
	row('Tools'),
	row('Infrastructure'),
	row('NFTs'),
	row('DeFi'),
	row('Gaming'),
	row('Discord'),
	row('Bridges'),
	row('Explorers'),
	row('Community & Events'),
	row('Tools', { title: 'Another tool' }),
	row('Hidden category', { status: 'inactive', new: true }),
	row('Unspecified status', { status: undefined })
];
const activeRows = rows.filter((project) => project.status === 'active');

describe('filterProjects', () => {
	it('All preserves every active row and drops inactive or unspecified status rows', () => {
		expect(filterProjects(rows, { category: 'All', term: '' })).toEqual(activeRows);
	});
	it('New selects only active rows with new exactly true', () => {
		expect(filterProjects(rows, { category: 'New', term: '' })).toEqual([rows[0]]);
	});
	it('selects only the requested category', () => {
		expect(filterProjects(rows, { category: 'Tools', term: '' })).toEqual([rows[2], rows[11]]);
	});
	it.each([
		['FAST', 0],
		['tokens', 1],
		['wALLEts', 1]
	] as const)('matches title, description and category case-insensitively: %s', (term, index) => {
		expect(filterProjects(rows, { category: 'All', term })).toEqual([rows[index]]);
	});
	it('combines category and search, returns no matches and restores the full active set', () => {
		expect(filterProjects(rows, { category: 'Tools', term: 'tokens' })).toEqual([]);
		expect(filterProjects(rows, { category: 'Missing', term: '' })).toEqual([]);
		expect(filterProjects(rows, { category: 'All', term: 'no-such-project' })).toEqual([]);
		expect(filterProjects(rows, { category: 'All', term: '' })).toHaveLength(activeRows.length);
	});
});

describe('category and project ordering', () => {
	const expected = [
		'All',
		'Infrastructure',
		'Tools',
		'Wallets',
		'Payments',
		'NFTs',
		'DeFi',
		'Gaming',
		'Discord',
		'Bridges',
		'Explorers',
		'Community & Events',
		'New'
	];
	it('categoriesOf keeps every active category once with All first and New last', () => {
		expect(categoriesOf(activeRows)).toEqual(expected);
		expect(categoriesOf([])).toEqual(['All', 'New']);
		expect(categoriesOf([...activeRows, row('New'), row('All')])).toEqual(expected);
	});
	it('orderCategories promotes Infrastructure, Tools, Wallets without dropping or inventing categories', () => {
		const categories = ['All', ...activeRows.map((project) => project.category), 'New'];
		const before = [...categories];
		expect(orderCategories(categories)).toEqual(expected);
		expect(orderCategories(categories)).not.toContain('DEXes');
		expect(categories).toEqual(before);
		expect(orderCategories(['Payments', 'Wallets', 'DeFi'])).toEqual([
			'Wallets',
			'Payments',
			'DeFi'
		]);
	});
	it('orderProjects promotes categories in order and preserves feed order within and after them', () => {
		const before = [...rows];
		const ordered = orderProjects(rows);
		expect(ordered).toEqual([
			rows[3],
			rows[2],
			rows[11],
			rows[1],
			...rows.filter(
				(project) => !['Infrastructure', 'Tools', 'Wallets'].includes(project.category)
			)
		]);
		expect(ordered).toHaveLength(rows.length);
		expect(rows).toEqual(before);
	});
});

describe('categoryHref', () => {
	it.each([
		['All', '/directory'],
		['New', '/directory/New']
	] as const)('%s links to %s', (category, href) => {
		expect(categoryHref(category)).toBe(href);
	});
	it.each(['Community Events', 'Tools & Services', 'DeFi'])(
		'encodes and round-trips %s without aliases',
		(category) => {
			expect(categoryHref(category)).toBe(`/directory/${encodeURIComponent(category)}`);
			expect(decodeURIComponent(categoryHref(category).slice('/directory/'.length))).toBe(category);
		}
	);
});

const initial: FeedState = { status: 'loading', projects: [], receivedAt: null };
describe('nextFeedState', () => {
	it('records successful receipt time and passes duplicate-id rows through unchanged', () => {
		const state = nextFeedState(initial, { ok: true, projects: rows }, 1000);
		expect(state).toEqual({ status: 'ok', projects: rows, receivedAt: 1000 });
		expect(state.projects).toBe(rows);
	});
	it('first failure is an error with no rows or false receipt time', () => {
		expect(nextFeedState(initial, { ok: false }, 1000)).toEqual({
			status: 'error',
			projects: [],
			receivedAt: null
		});
	});
	it('a failed refresh keeps the SAME rows and receipt time, including repeated failure', () => {
		const good = nextFeedState(initial, { ok: true, projects: rows }, 0);
		const stale = nextFeedState(good, { ok: false }, 2000);
		expect(stale).toEqual({ status: 'stale', projects: rows, receivedAt: 0 });
		expect(stale.projects).toBe(good.projects);
		expect(nextFeedState(stale, { ok: false }, 3000)).toEqual(stale);
		expect(directoryView({ status: stale.status, total: activeRows.length, shown: 2 })).toBe(
			'list'
		);
	});
	it('a successful empty feed is also retained as stale after failure', () => {
		const good = nextFeedState(initial, { ok: true, projects: [] }, 1000);
		expect(nextFeedState(good, { ok: false }, 2000)).toEqual({ ...good, status: 'stale' });
	});
	it('recovers from first failure or stale on success', () => {
		for (const status of ['error', 'stale'] as const) {
			expect(nextFeedState({ ...initial, status }, { ok: true, projects: rows }, 3000)).toEqual({
				status: 'ok',
				projects: rows,
				receivedAt: 3000
			});
		}
	});
});

it('helpers accept a row without logo, url or twitter', () => {
	const bare = row('Tools');
	expect(filterProjects([bare], { category: 'All', term: '' })).toEqual([bare]);
	expect(orderProjects([bare])).toEqual([bare]);
	expect(categoriesOf([bare])).toEqual(['All', 'Tools', 'New']);
	expect(orderCategories([bare.category])).toEqual(['Tools']);
	expect(categoryHref(bare.category)).toBe('/directory/Tools');
	expect(nextFeedState(initial, { ok: true, projects: [bare] }, 1000).projects).toEqual([bare]);
});

it('formats receipt time as an absolute UTC date and time independent of local timezone', () => {
	expect(formatReceivedAt(Date.UTC(2026, 10, 6, 13, 4, 5))).toBe('2026-11-06 13:04:05 UTC');
	expect(formatReceivedAt(0)).toBe('1970-01-01 00:00:00 UTC');
});
