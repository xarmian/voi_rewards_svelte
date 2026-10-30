import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('$lib/supabase', () => ({ supabasePublicClient: { from: mocks.from } }));

import { DIRECTORY_TIMEOUT_MS, directoryView, fetchDirectoryProjects } from './projects';

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
