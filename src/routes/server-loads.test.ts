import { existsSync, readFileSync } from 'node:fs';
import { stringify } from 'devalue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), lockvest: vi.fn() }));
vi.mock('$lib/supabase', () => ({ supabasePublicClient: { from: mocks.from } }));
vi.mock('$lib/services/lockvest', () => ({ getLockContractByAddress: mocks.lockvest }));
vi.mock('$lib/utils', () => ({ getTokensByEpoch: async () => 100 }));
vi.mock('avm-wallet-svelte', async () => {
	const { writable } = await import('svelte/store');
	return { selectedWallet: writable(null) };
});

import { selectedWallet } from 'avm-wallet-svelte';
import { fetchProjects } from './(site)/phase2/[...slug]/projects';
import { GET } from './api/relay-rewards/+server';

// TASK-32: record when Supabase's lazy thenables start, before releasing any response.
function query() {
	let resolve!: (value: { data: unknown; error: unknown; count: number | null }) => void;
	const response = new Promise<{ data: unknown; error: unknown; count: number | null }>((done) => {
		resolve = done;
	});
	const started = vi.fn();
	const builder = {
		select: vi.fn(() => builder),
		order: vi.fn(() => builder),
		limit: vi.fn(() => builder),
		eq: vi.fn(() => builder),
		or: vi.fn(() => builder),
		gte: vi.fn(() => builder),
		lte: vi.fn(() => builder),
		returns: () => builder,
		single: () => builder,
		then: (yes: (value: unknown) => unknown, no: (reason: unknown) => unknown) => {
			started();
			return response.then(yes, no);
		}
	};
	return {
		builder,
		started,
		resolve: (data: unknown = [], error: unknown = null, count: number | null = null) =>
			resolve({ data, error, count })
	};
}

const imageUrl = 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png';
const project = { id: 1, title: 'Kibisis', column: 'kibisis', description: 'Wallet quests' };
const quests = [
	{ id: 1, project: 1, status: null },
	{ id: 2, project: 1, status: 'active' },
	{ id: 3, project: 1, status: 'inactive' },
	{ id: 4, project: 2, status: 'done' }
];

beforeEach(() => {
	vi.resetAllMocks();
	selectedWallet.update(() => null);
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('TASK-32 leaderboard server load', () => {
	it('starts rows and exact count together and preserves the success shape', async () => {
		const { load } = await import('./(site)/leaderboard/+page.server');
		const rows = query();
		const count = query();
		mocks.from.mockReturnValueOnce(rows.builder).mockReturnValueOnce(count.builder);
		const pending = load();
		await vi.waitFor(() => {
			expect(rows.started).toHaveBeenCalledOnce();
			expect(count.started).toHaveBeenCalledOnce();
		});
		expect(rows.builder.order).toHaveBeenCalledWith('total_quest_points', { ascending: false });
		expect(rows.builder.limit).toHaveBeenCalledWith(50);
		expect(count.builder.select).toHaveBeenCalledWith('count', { count: 'exact' });
		const ranks = [{ address: 'W', total_quest_points: 42 }];
		rows.resolve(ranks);
		count.resolve(null, null, 100);
		expect(await pending).toEqual({
			ranks,
			total_accounts: 100,
			pageMetaTags: {
				title: 'Voi TestNet Phase 2 Leaderboard',
				description: 'Get Your Quest On, with the Voi Testnet Network',
				imageUrl
			}
		});
	});

	it.each(['rows', 'count'])('keeps the %s error return serializable', async (failure) => {
		const { load } = await import('./(site)/leaderboard/+page.server');
		const rows = query();
		const count = query();
		mocks.from.mockReturnValueOnce(rows.builder).mockReturnValueOnce(count.builder);
		rows.resolve([], failure === 'rows' ? { message: 'rows failed' } : null);
		count.resolve(null, failure === 'count' ? { message: 'count failed' } : null, 0);
		const result = await load();
		expect(result).toEqual({ status: 500, error: 'Failed to fetch leaderboard data' });
		expect(() => stringify(result)).not.toThrow();
	});
});

describe('TASK-32 fetchProjects', () => {
	it('starts both queries before either resolves and combines their results', async () => {
		const projects = query();
		const allQuests = query();
		mocks.from.mockReturnValueOnce(projects.builder).mockReturnValueOnce(allQuests.builder);
		const pending = fetchProjects();
		await vi.waitFor(() => {
			expect(projects.started).toHaveBeenCalledOnce();
			expect(allQuests.started).toHaveBeenCalledOnce();
		});
		expect(mocks.from.mock.calls).toEqual([['vr_projects'], ['vr_quests']]);
		projects.resolve([project]);
		allQuests.resolve(quests);
		expect(await pending).toEqual([{ ...project, quests: quests.slice(0, 3) }]);
	});

	it.each(['projects', 'quests'])('returns [] on a %s error', async (failure) => {
		const projects = query();
		const allQuests = query();
		mocks.from.mockReturnValueOnce(projects.builder).mockReturnValueOnce(allQuests.builder);
		projects.resolve([project], failure === 'projects' ? { message: 'failed' } : null);
		allQuests.resolve(quests, failure === 'quests' ? { message: 'failed' } : null);
		expect(await fetchProjects()).toEqual([]);
		expect(console.error).toHaveBeenCalledWith(`Error fetching ${failure}:`, { message: 'failed' });
	});
});

describe('TASK-32 phase2 server load', () => {
	function setup() {
		const projects = query();
		const allQuests = query();
		const leaderboard = query();
		const phase2 = query();
		const activeQuests = query();
		mocks.from.mockImplementation((table: string) => {
			if (table === 'vr_projects') return projects.builder;
			if (table === 'leaderboard') return leaderboard.builder;
			if (table === 'vr_phase2') return phase2.builder;
			return mocks.from.mock.calls.filter(([name]) => name === 'vr_quests').length === 1
				? allQuests.builder
				: activeQuests.builder;
		});
		return { projects, allQuests, leaderboard, phase2, activeQuests };
	}

	it('starts fetchProjects and all three wallet queries together, preserving the quest filter', async () => {
		const { load } = await import('./(site)/phase2/[...slug]/+page.server');
		const queries = setup();
		const pending = load({ params: { slug: 'W/kibisis' } } as never);
		await vi.waitFor(() => {
			for (const item of Object.values(queries)) expect(item.started).toHaveBeenCalledOnce();
		});
		expect(queries.leaderboard.builder.eq).toHaveBeenCalledWith('wallet', 'W');
		expect(queries.phase2.builder.eq).toHaveBeenCalledWith('address', 'W');
		expect(queries.activeQuests.builder.or).toHaveBeenCalledWith(
			'status.is.null,status.neq.inactive'
		);
		const questList = quests.filter(
			(quest) => quest.status === null || quest.status !== 'inactive'
		);
		queries.projects.resolve([project]);
		queries.allQuests.resolve(quests);
		queries.leaderboard.resolve([{ wallet: 'W', total: 5 }]);
		queries.phase2.resolve([{ address: 'W', airdrop_amount: 123 }]);
		queries.activeQuests.resolve(questList);
		expect(await pending).toEqual({
			props: {
				wallet: 'W',
				projectId: 1,
				leaderboardData: { wallet: 'W', total: 5 },
				projects: [{ ...project, quests: quests.slice(0, 3) }],
				questData: { address: 'W', airdrop_amount: 123 },
				questList,
				totalPoints: 0,
				discordMultiplier: 1,
				humanMultiplier: 1,
				estimatedReward: 123
			},
			pageMetaTags: {
				title: 'Voi TestNet Phase 2 Quest Tracker | Kibisis',
				description: project.description,
				imageUrl
			}
		});
	});

	it.each(['leaderboard', 'phase2', 'activeQuests'] as const)(
		'ignores a %s error independently',
		async (failure) => {
			const { load } = await import('./(site)/phase2/[...slug]/+page.server');
			const queries = setup();
			queries.projects.resolve([project]);
			queries.allQuests.resolve(quests);
			queries.leaderboard.resolve(
				[{ wallet: 'W' }],
				failure === 'leaderboard' ? { message: 'failed' } : null
			);
			queries.phase2.resolve(
				[{ airdrop_amount: 123 }],
				failure === 'phase2' ? { message: 'failed' } : null
			);
			queries.activeQuests.resolve(
				quests,
				failure === 'activeQuests' ? { message: 'failed' } : null
			);
			const result = await load({ params: { slug: 'W' } } as never);
			expect(result.props).toMatchObject({
				leaderboardData: failure === 'leaderboard' ? undefined : { wallet: 'W' },
				questData: failure === 'phase2' ? undefined : { airdrop_amount: 123 },
				questList: failure === 'activeQuests' ? [] : quests,
				estimatedReward: failure === 'phase2' ? 0 : 123
			});
		}
	);

	it('does not query wallet data when there is no wallet', async () => {
		const { load } = await import('./(site)/phase2/[...slug]/+page.server');
		const queries = setup();
		queries.projects.resolve([project]);
		queries.allQuests.resolve(quests);
		const result = await load({ params: { slug: '_/kibisis' } } as never);
		expect(mocks.from.mock.calls).toEqual([['vr_projects'], ['vr_quests']]);
		expect(result.props).toMatchObject({ wallet: '', projectId: 1, questList: [] });
	});
});

describe('TASK-32 relay rewards', () => {
	const event = () =>
		({
			url: new URL('https://example.test/api/relay-rewards?from=2024-10-30&to=2024-11-05')
		}) as never;

	it('starts peers and mappings together and keeps the CSV result', async () => {
		const peers = query();
		const mappings = query();
		mocks.from.mockReturnValueOnce(peers.builder).mockReturnValueOnce(mappings.builder);
		const pending = GET(event());
		await vi.waitFor(() => {
			expect(peers.started).toHaveBeenCalledOnce();
			expect(mappings.started).toHaveBeenCalledOnce();
		});
		expect(mocks.from.mock.calls).toEqual([['vr_relay_peers'], ['vr_relay_wallets']]);
		peers.resolve([{ host_name: 'node-1', peer_count: 10 }]);
		mappings.resolve([{ host_prefix: 'node', wallet_address: 'W' }]);
		const response = await pending;
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('account,userType,tokenAmount\nW,relay,10000000');
	});

	it.each(['peers', 'mappings'])('preserves the error response when %s fail', async (failure) => {
		const peers = query();
		const mappings = query();
		mocks.from.mockReturnValueOnce(peers.builder).mockReturnValueOnce(mappings.builder);
		peers.resolve([], failure === 'peers' ? { message: 'failed' } : null);
		mappings.resolve([], failure === 'mappings' ? { message: 'failed' } : null);
		const response = await GET(event());
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: 'Failed to generate relay rewards CSV' });
	});
});

describe('TASK-32 wallet loads', () => {
	it('returns the lockvest owner and tracks wallet invalidation on the server', async () => {
		const { load } = await import('./(site)/wallet/[...id]/+page.server');
		mocks.lockvest.mockResolvedValue({ global_owner: 'OWNER' });
		const depends = vi.fn();
		expect(await load({ params: { id: 'CONTRACT' }, depends } as never)).toEqual({
			parentWalletId: 'OWNER'
		});
		expect(mocks.lockvest).toHaveBeenCalledWith('CONTRACT');
		expect(depends).toHaveBeenCalledWith('wallet:id');
	});

	it('returns null and logs when lockvest fails', async () => {
		const { load } = await import('./(site)/wallet/[...id]/+page.server');
		const error = new Error('lookup failed');
		mocks.lockvest.mockRejectedValue(error);
		expect(await load({ params: { id: 'CONTRACT' }, depends: vi.fn() } as never)).toEqual({
			parentWalletId: null
		});
		expect(console.error).toHaveBeenCalledWith('Lockvest lookup failed:', error);
	});

	it('returns null without a lookup when no wallet is in the URL', async () => {
		const { load } = await import('./(site)/wallet/[...id]/+page.server');
		expect(await load({ params: { id: '' }, depends: vi.fn() } as never)).toEqual({
			parentWalletId: null
		});
		expect(mocks.lockvest).not.toHaveBeenCalled();
	});

	it.each([
		['URL', 'URL'],
		['', 'SELECTED']
	])('merges server data with the wallet for param %s', async (id, expected) => {
		const { load } = await import('./(site)/wallet/[...id]/+page');
		selectedWallet.set({ address: 'SELECTED' } as never);
		const depends = vi.fn();
		expect(
			await load({ params: { id }, data: { parentWalletId: 'OWNER' }, depends } as never)
		).toEqual({ parentWalletId: 'OWNER', walletId: expected });
		expect(depends).toHaveBeenCalledWith('wallet:id');
		expect(mocks.lockvest).not.toHaveBeenCalled();
	});
});

describe('TASK-32 quests server loads', () => {
	it('returns projects and preserves /quests metadata', async () => {
		const { load } = await import('./(site)/quests/+page.server');
		const projects = query();
		const allQuests = query();
		mocks.from.mockReturnValueOnce(projects.builder).mockReturnValueOnce(allQuests.builder);
		projects.resolve([project]);
		allQuests.resolve(quests);
		expect(await load()).toEqual({
			projects: [{ ...project, quests: quests.slice(0, 3) }],
			pageMetaTags: {
				title: 'Voi Testnet Quests',
				description: 'Get Your Quest On, with the Voi Testnet Network',
				imageUrl
			}
		});
	});

	it('passes the selected project and fetched projects with the original metadata', async () => {
		const { load } = await import('./(site)/quests/[...projectId]/+page.server');
		const projects = query();
		const allQuests = query();
		mocks.from.mockReturnValueOnce(projects.builder).mockReturnValueOnce(allQuests.builder);
		projects.resolve([project]);
		allQuests.resolve(quests);
		expect(await load({ params: { projectId: 'Kibisis' } } as never)).toEqual({
			projects: [{ ...project, quests: quests.slice(0, 3) }],
			props: { projectId: 1 },
			pageMetaTags: {
				title: 'Voi Testnet Quests | Kibisis',
				description: project.description,
				imageUrl
			}
		});
	});

	it('keeps the project-not-found return serializable', async () => {
		const { load } = await import('./(site)/quests/[...projectId]/+page.server');
		const projects = query();
		const allQuests = query();
		mocks.from.mockReturnValueOnce(projects.builder).mockReturnValueOnce(allQuests.builder);
		projects.resolve([]);
		allQuests.resolve([]);
		const result = await load({ params: { projectId: 'missing' } } as never);
		expect(result).toEqual({ status: 404, error: 'Project not found' });
		expect(() => stringify(result)).not.toThrow();
	});
});

it('TASK-32 keeps DB loads on the server and only wallet merging universal', () => {
	for (const route of [
		'leaderboard',
		'relays',
		'phase2/[...slug]',
		'quests',
		'quests/[...projectId]',
		'wallet/[...id]'
	]) {
		const base = new URL(`./(site)/${route}/`, import.meta.url);
		expect(existsSync(new URL('+page.server.ts', base)), route).toBe(true);
		const universal = new URL('+page.ts', base);
		if (route !== 'wallet/[...id]') expect(existsSync(universal), route).toBe(false);
		else expect(readFileSync(universal, 'utf8')).not.toMatch(/supabase|lockvest/);
	}
});
