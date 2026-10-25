import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

// Exercise the component scripts with controlled dependencies, without a browser or live APIs.
function componentScript(name: string, dependencies: Record<string, unknown>) {
	const source = readFileSync(new URL(`./${name}.svelte`, import.meta.url), 'utf8');
	const script = source.split('<script lang="ts">')[1].split('</script>')[0]
		.replace(/^\s*import .*;$/gm, '').replace(/export let /g, 'let ');
	const context = createContext({
		console: { log() {}, error() {} }, browser: false, onMount() {}, onDestroy() {},
		config: { proposalApiBaseUrl: '/proposals' }, AbortSignal, ...dependencies
	});
	runInContext(ts.transpileModule(script, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
	}).outputText, context);
	return (code: string) => runInContext(code, context);
}

const supply = { 'online-money': 1_000_000 };
const dates = [{ id: 'latest', epoch: 62 }];

for (const [label, epochData, dateRanges, reward] of [
	['undefined epoch data', undefined, dates, 10],
	['an epoch error body', { error: 'unavailable' }, dates, 10],
	['empty dates', { blacklist_balance_total: 0 }, [], 10],
	['a missing epoch', { blacklist_balance_total: 0 }, [{ id: 'latest' }], 10],
	['non-finite rewards', { blacklist_balance_total: 0 }, dates, NaN]
] as const) {
	test(`node reports ${label} as an error and stops loading`, async () => {
		const run = componentScript('NodeComponent', {
			getSupplyInfo: async () => supply,
			dataTable: {
				fetchDateRanges: async () => dateRanges,
				fetchData: async () => epochData
			},
			getTokensByEpoch: async () => reward,
			getAccountInfo: async () => ({ amount: 100 }),
			getConsensusInfo: async () => ({ total_blocks: 1 })
		});
		await run('walletId = "A"; fetchNodeData()');
		assert.equal(run('loading'), false);
		assert.equal(run('consensusError'), true);
	});
}

for (const stage of ['fetch', 'json', 'history'] as const) {
	for (const fails of [false, true]) {
		test(`proposals keep wallet B after wallet A's late ${stage} ${fails ? 'failure' : 'result'}`, async () => {
			const pending = Promise.withResolvers<unknown>();
			const reached = Promise.withResolvers<void>();
			let paused = false;
			const result = (at: string, value: unknown) => {
				if (at === stage && !paused) {
					paused = true;
					reached.resolve();
					return pending.promise;
				}
				return Promise.resolve(value);
			};
			const aData = { '2026-10-25': [{ block: 1 }] };
			const history = [{ date: '2026-10-25', avg_online_stake: 1_000_000 }];
			const aResponse = { ok: true, json: () => result('json', aData) };
			const run = componentScript('ProposalsComponent', {
				fetch: (url: string) => result('fetch', url.endsWith('wallet=A')
					? aResponse : Response.json({ '2026-10-25': [{ block: 2 }, { block: 3 }] })),
				getAccountInfo: async (wallet: string) => ({ amount: wallet === 'B' ? 200 : 100 }),
				getSupplyInfo: async () => supply,
				onlineStakeStore: { getData: () => result('history', history) }
			});
			const first = run('walletId = "A"; updateChartData()');
			await reached.promise;
			await run('walletId = "B"; updateChartData()');
			if (fails) pending.reject(new Error('wallet A failed'));
			else pending.resolve({ fetch: aResponse, json: aData, history }[stage]);
			await first;
			assert.equal(run('accountInfo.amount'), 200);
			assert.equal(run('data[0].actual'), 2);
			assert.equal(run('apiData["2026-10-25"].length'), 2);
			assert.equal(run('loadError'), null);
			assert.equal(run('isLoading'), false);
		});
	}
}

for (const history of [null, [{ date: '2026-10-24', avg_online_stake: 1_000_000 }]]) {
	test(`proposals preserve actual counts and null expectations for ${history === null ? 'unavailable history' : 'a missing date'}`, async () => {
		const run = componentScript('ProposalsComponent', {
			fetch: async () => Response.json({ '2026-10-25': [{ block: 1 }] }),
			getAccountInfo: async () => ({ amount: 100, status: 'Online' }),
			getSupplyInfo: async () => supply,
			onlineStakeStore: { getData: async () => history }
		});
		await run('walletId = "A"; updateChartData()');
		assert.equal(run('loadError'), null);
		assert.equal(run('data[0].actual'), 1);
		assert.equal(run('data[0].expected'), null);
		assert.equal(run('expectedUnavailable'), history === null);
	});
}

const stages = ['supply', 'dates', 'epoch', 'rewards', 'account', 'consensus'] as const;
for (const stage of stages) {
	for (const fails of [false, true]) {
		test(`a late wallet A ${stage} ${fails ? 'failure' : 'result'} cannot overwrite wallet B`, async () => {
			const pending = Promise.withResolvers<unknown>();
			const reached = Promise.withResolvers<void>();
			let paused = false;
			const result = (at: string, value: unknown) => {
				if (at === stage && !paused) {
					paused = true;
					reached.resolve();
					return pending.promise;
				}
				return Promise.resolve(value);
			};
			const run = componentScript('NodeComponent', {
				getSupplyInfo: () => result('supply', supply),
				dataTable: {
					fetchDateRanges: () => result('dates', dates),
					fetchData: () => result('epoch', { blacklist_balance_total: 0 })
				},
				getTokensByEpoch: () => result('rewards', 10),
				getAccountInfo: (wallet: string) => result('account', { amount: wallet === 'B' ? 200 : 100 }),
				getConsensusInfo: (wallet: string) => result('consensus', { total_blocks: wallet === 'B' ? 2 : 1 })
			});
			const first = run('walletId = "A"; fetchNodeData()');
			await reached.promise;
			await run('walletId = "B"; fetchNodeData()');
			if (fails) pending.reject(new Error('wallet A failed'));
			else pending.resolve({ supply, dates, epoch: { blacklist_balance_total: 0 }, rewards: 10,
				account: { amount: 100 }, consensus: { total_blocks: 1 } }[stage]);
			await first;
			assert.equal(run('balance'), 200);
			assert.equal(run('accountInfo.amount'), 200);
			assert.equal(run('apiData.total_blocks'), 2);
			assert.equal(run('consensusError'), false);
			assert.equal(run('loading'), false);
		});
	}
}

test('a new wallet clears old account data and an obsolete request cannot stop its spinner', async () => {
	const first = Promise.withResolvers<unknown>();
	const second = Promise.withResolvers<unknown>();
	let calls = 0;
	const run = componentScript('NodeComponent', {
		getSupplyInfo: () => ++calls === 1 ? first.promise : second.promise
	});
	const a = run('walletId = "A"; fetchNodeData()');
	const b = run('accountInfo = { amount: 100 }; apiData = { total_blocks: 1 }; balance = 100; walletId = "B"; fetchNodeData()');
	assert.equal(run('accountInfo'), undefined);
	assert.equal(run('Object.keys(apiData).length'), 0);
	assert.equal(run('balance'), 0);
	first.resolve(null);
	await a;
	assert.equal(run('loading'), true);
	assert.equal(run('consensusError'), false);
	second.resolve(null);
	await b;
	assert.equal(run('loading'), false);
	assert.equal(run('consensusError'), true);
});
