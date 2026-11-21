import { beforeEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { epochRange } from './calendar';

// The switch-on wallet, unmocked: reads start in today's order.
const order = vi.hoisted(() => [] as string[]);
const mocks = vi.hoisted(() => ({ rows: vi.fn(), account: vi.fn() }));
vi.mock('$lib/utils/algod', () => ({
	algodClient: { getApplicationByID: () => ({ do: async () => ({ params: { globalState: [] } }) }) }
}));
vi.mock('$lib/stores/accounts', () => ({
	getAccountInfo: mocks.account,
	requireAccountInfo: mocks.account,
	getSupplyInfo: async () => {
		order.push('supply');
		return { 'current-round': 100, 'online-money': 1e12, 'blacklisted-money': 0 };
	}
}));
vi.mock('$lib/services/lockvest', () => ({
	getLockContractsByOwner: async () => {
		order.push('locks');
		return [];
	}
}));
vi.mock('$lib/services/accounts', () => ({
	fetchFungibleTokens: async () => ({ tokens: [], partial: false })
}));
vi.mock('$lib/stores/price', async () => {
	const { writable } = await import('svelte/store');
	return {
		fetchVoiPrice: async () => {
			order.push('price');
		},
		voiPrice: writable({ price: 0.001, error: null })
	};
});
vi.mock('$lib/utils', () => ({ getTokensByEpoch: async () => 2000000 }));
vi.mock('../../stores/dataTable', () => ({
	dataTable: {
		fetchDateRanges: async () => {
			order.push('dates');
			return Array.from({ length: 13 }, (_, i) => ({ epoch: 92 + i, id: epochRange(92 + i).id }));
		},
		fetchData: mocks.rows
	}
}));
import { loadWallet } from '$lib/wallet/load';

beforeEach(() => {
	order.length = 0;
	mocks.account.mockResolvedValue({ amount: 1e9, status: 'Online', round: 100 });
	mocks.rows.mockImplementation(async () => ({
		data: [{ proposer: 'OWNER', block_count: 10 }],
		num_blocks: 100000,
		num_blocks_ballast: 0,
		max_timestamp: '2026-10-25T00:00:00Z'
	}));
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			order.push(String(url));
			return Response.json({
				epochs: Array.from({ length: 13 }, (_, i) => ({
					epoch_number: 92 + i,
					eligible_online_stake: 1e6
				}))
			});
		})
	);
});

test('the wallet load starts the epoch stake read first, then price, supply, locks and dates', async () => {
	const data = await loadWallet('OWNER', 'OWNER');
	expect(order.slice(0, 5)).toEqual(['/api/epochs', 'price', 'supply', 'locks', 'dates']);
	expect(data.current?.epoch).toBe(104);
	expect(data.history).toHaveLength(12);
	expect(data.asOf).toBe('2026-10-25T00:00:00Z');
});

/** WalletRewards' reader list, evaluated from its script with stub loaders. */
function walletReaders() {
	const source = readFileSync(
		new URL('../ds/WalletRewards/WalletRewards.svelte', import.meta.url),
		'utf8'
	);
	const script = source.split('<script lang="ts">')[1].split('</script>')[0];
	const ast = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true);
	const wanted = ast.statements.filter(
		(node) =>
			(ts.isVariableStatement(node) &&
				node.declarationList.declarations.some(
					(d) => ts.isIdentifier(d.name) && ['epochReaders', 'readers'].includes(d.name.text)
				)) ||
			(ts.isFunctionDeclaration(node) && node.name?.text === 'refresh')
	);
	const loads: string[] = [];
	const loader = (name: string) => ({ [name]: async () => {} })[name];
	const names = [
		'loadRewardEpochs',
		'loadPayouts',
		'loadDailyProposals',
		'loadRewardAccount',
		'loadEligibleStakes',
		'loadDailyStake',
		'loadRewardSupply'
	];
	const context: Record<string, unknown> = Object.fromEntries(
		names.map((name) => [name, loader(name)])
	);
	const createReadSource = (read: { name: string }) => ({
		load: () => loads.push(read.name),
		dispose: () => {}
	});
	Object.assign(context, {
		createReadSource,
		pageAddress: 'Y',
		sources: {},
		epoch: {},
		// The switch-on reader factory, wired to the same stub loaders.
		epochRewardReaders: (state: unknown) =>
			state && {
				epochs: createReadSource(context.loadRewardEpochs as { name: string }),
				payouts: createReadSource(context.loadPayouts as { name: string }),
				eligible: createReadSource(context.loadEligibleStakes as { name: string }),
				supply: createReadSource(context.loadRewardSupply as { name: string })
			}
	});
	const code = wanted.map((node) => ts.transpile(node.getText(ast))).join('\n');
	const { readers, refresh } = runInNewContext(`${code}; ({ readers, refresh })`, context);
	return { readers, refresh, loads };
}

test('the rewards readers start in order and Refresh rewards refreshes all seven', () => {
	const { readers, refresh, loads } = walletReaders();
	expect(Object.keys(readers)).toEqual([
		'epochs',
		'payouts',
		'daily',
		'account',
		'eligible',
		'dailyStake',
		'supply'
	]);
	refresh();
	expect(loads).toEqual([
		'loadRewardEpochs',
		'loadPayouts',
		'loadDailyProposals',
		'loadRewardAccount',
		'loadEligibleStakes',
		'loadDailyStake',
		'loadRewardSupply'
	]);
});
