import { readFileSync } from 'node:fs';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beforeEach, expect, test, vi } from 'vitest';
import { render } from 'svelte/server';

// The switch-off calculator and node panel: no epoch read starts and no epoch figure shows.
vi.mock('$lib/epochRewards/config', () => ({ EPOCH_REWARDS_ENABLED: false }));
const mocks = vi.hoisted(() => ({
	dates: vi.fn(),
	rows: vi.fn(),
	pool: vi.fn(),
	supply: vi.fn(),
	account: vi.fn(),
	price: vi.fn()
}));
vi.mock('$lib/stores/accounts', () => ({
	requireAccountInfo: mocks.account,
	getAccountInfo: mocks.account,
	getSupplyInfo: mocks.supply
}));
vi.mock('$lib/stores/price', async () => {
	const { writable } = await import('svelte/store');
	return {
		fetchVoiPrice: mocks.price,
		voiPrice: writable({ price: 0.001, error: null, lastUpdated: null })
	};
});
vi.mock('$lib/utils', () => ({ getTokensByEpoch: mocks.pool }));
vi.mock('./dataTable', () => ({
	dataTable: { fetchDateRanges: mocks.dates, fetchData: mocks.rows }
}));
vi.mock('$lib/epochRewards/calculator/inputs', async (original) => {
	const actual = await original<typeof import('$lib/epochRewards/calculator/inputs')>();
	return {
		...actual,
		loadCalculatorInputs: vi.fn(actual.loadCalculatorInputs),
		epochScheduleAmounts: vi.fn(actual.epochScheduleAmounts)
	};
});
import { epochCalculator } from '$lib/epochRewards/client';
import { epochScheduleAmounts, loadCalculatorInputs } from '$lib/epochRewards/calculator/inputs';
import { createReadSource } from '$lib/wallet/read';
import { loadCalculatorBalance, loadCalculatorPrice } from '$lib/wallet/calculator';
import CalculatorComponent from '$lib/component/CalculatorComponent.svelte';
import CalculatorPage from '../../routes/(site)/calculator/+page.svelte';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.supply.mockResolvedValue({ 'online-money': 1e12 });
	mocks.account.mockResolvedValue({ amount: 1e9 });
	mocks.price.mockResolvedValue(undefined);
	mocks.dates.mockResolvedValue([{ id: 'latest', epoch: 104 }]);
	mocks.rows.mockResolvedValue({ blacklist_balance_total: 0 });
	mocks.pool.mockResolvedValue(10);
});

const text = (html: string) =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ');

test('the calculator shows the stake, price and real-time block rewards, and no epoch estimate', () => {
	for (const walletAddress of [undefined, 'Y']) {
		const html = render(CalculatorComponent, { props: { walletAddress } }).body;
		const shown = text(html);
		for (const gone of [
			'Your estimated rewards',
			'View Reward Schedule',
			'Download CSV',
			'Monthly node cost',
			'Cost and price'
		])
			expect(shown).not.toContain(gone);
		expect(shown).not.toMatch(/epoch/i);
		expect(shown).toContain('Your stake');
		expect(html).toContain('aria-label="Price"');
		expect(html).toMatch(/<h2 class="text-h2">Price<\/h2>/);
		for (const control of ['Custom', 'Refresh price']) expect(shown).toContain(control);
		expect(html).toContain('id="estimated-block-rewards-heading"');
		// With no node cost field or price alert above it, the price block opens without a rule.
		expect(html).not.toContain('class="space-y-3 border-t border-line pt-4"');
	}
});

test('the calculator keeps a disclaimer worded for the block rewards estimate', () => {
	for (const walletAddress of [undefined, 'Y']) {
		const html = render(CalculatorComponent, { props: { walletAddress } }).body;
		const shown = text(html);
		for (const line of [
			'* Calculations assume current network conditions.',
			'* Actual rewards may vary based on network participation and other factors.',
			'* This tool is for entertainment purposes only. It is not financial advice.',
			'Market price timestamp unavailable.'
		])
			expect(shown.split(line)).toHaveLength(2);
		expect(shown).not.toContain('weekly compounding');
		expect(shown).not.toContain('rates may vary');
		// The disclaimer follows the block rewards estimate it qualifies.
		const clean = html.replace(/<!--[\s\S]*?-->/g, '');
		expect(clean.indexOf('* Calculations assume')).toBeGreaterThan(
			clean.indexOf('aria-labelledby="estimated-block-rewards-heading"')
		);
	}
});

test('the calculator page describes the real-time block rewards estimate', () => {
	const shown = text(render(CalculatorPage).body);
	expect(shown).toContain(
		'Estimate your real-time block rewards at your chosen stake and VOI price.'
	);
	expect(shown).not.toContain('node rewards and costs');
});

/** CalculatorComponent's readers and changeAddress, evaluated with the real loaders. */
function calculatorScript() {
	const source = readFileSync(
		new URL('../component/CalculatorComponent.svelte', import.meta.url),
		'utf8'
	);
	const script = source.split('<script lang="ts">')[1].split('</script>')[0];
	const ast = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true);
	const names = ['epochCalc', 'balanceReader', 'priceReader'];
	const wanted = ast.statements.filter(
		(node) =>
			(ts.isVariableStatement(node) &&
				node.declarationList.declarations.some(
					(d) => ts.isIdentifier(d.name) && names.includes(d.name.text)
				)) ||
			(ts.isFunctionDeclaration(node) && node.name?.text === 'changeAddress')
	);
	expect(wanted).toHaveLength(4);
	const code = wanted.map((node) => ts.transpile(node.getText(ast))).join('\n');
	const context = {
		epochCalculator,
		createReadSource,
		loadCalculatorBalance,
		loadCalculatorPrice,
		applyBalance: () => {}
	};
	return (statement: string) => runInNewContext(`${code}\n${statement}`, context);
}

test('the calculator makes no epoch read: no factory, no inputs, rows or pools', async () => {
	expect(epochCalculator()).toBeNull();
	const run = calculatorScript();
	expect(run('epochCalc')).toBeNull();
	run('changeAddress("Y")');
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(mocks.account).toHaveBeenCalledWith('Y', { force: false });
	expect(mocks.price).toHaveBeenCalled();
	expect(loadCalculatorInputs).not.toHaveBeenCalled();
	expect(epochScheduleAmounts).not.toHaveBeenCalled();
	expect(mocks.supply).not.toHaveBeenCalled();
	expect(mocks.dates).not.toHaveBeenCalled();
	expect(mocks.rows).not.toHaveBeenCalled();
	expect(mocks.pool).not.toHaveBeenCalled();
});

const nodeSource = readFileSync(
	new URL('../component/NodeComponent.svelte', import.meta.url),
	'utf8'
);

/** NodeComponent's script with controlled dependencies, as consensusData.test runs it. */
function nodeScript(dependencies: Record<string, unknown>) {
	const script = nodeSource
		.split('<script lang="ts">')[1]
		.split('</script>')[0]
		.replace(/^\s*import .*;$/gm, '')
		.replace(/export let /g, 'let ');
	const context = createContext({
		console: { log() {}, error() {} },
		browser: false,
		onMount() {},
		...dependencies
	});
	runInContext(
		ts.transpileModule(script, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	return (code: string) => runInContext(code, context);
}

test('the node panel reads no epoch rewards and still loads its consensus data', async () => {
	const loadNodeEpochRewards = vi.fn(async () => null);
	const projectEpochRewards = vi.fn(() => ({ perDay: 1, perWeek: 1, perMonth: 1 }));
	const run = nodeScript({
		EPOCH_REWARDS_ENABLED: false,
		loadNodeEpochRewards,
		projectEpochRewards,
		getSupplyInfo: async () => ({ 'online-money': 1_000_000 }),
		getAccountInfo: async () => ({ amount: 100 }),
		getConsensusInfo: async () => ({ total_blocks: 1 })
	});
	await run('walletId = "A"; fetchNodeData()');
	expect(loadNodeEpochRewards).not.toHaveBeenCalled();
	expect(projectEpochRewards).not.toHaveBeenCalled();
	expect(run('consensusError')).toBe(false);
	expect(run('loading')).toBe(false);
	expect(run('balance')).toBe(100);
	expect(run('apiData.total_blocks')).toBe(1);
	expect(run('estimatedRewardsPerWeek')).toBe(0);
});

/** The [start, end) ranges of each `{#if EPOCH_REWARDS_ENABLED}` block in the markup. */
function gated(markup: string): [number, number][] {
	const ranges: [number, number][] = [];
	const open = '{#if EPOCH_REWARDS_ENABLED}';
	for (let start = markup.indexOf(open); start >= 0; start = markup.indexOf(open, start + 1)) {
		let depth = 0;
		const tags = /\{#if\b|\{\/if\}/g;
		tags.lastIndex = start;
		for (let tag = tags.exec(markup); tag; tag = tags.exec(markup)) {
			depth += tag[0] === '{/if}' ? -1 : 1;
			if (depth === 0) {
				ranges.push([start, tag.index + tag[0].length]);
				break;
			}
		}
	}
	return ranges;
}

test('each node reward figure and the APR row sit inside the switch', () => {
	const markup = nodeSource.split('</script>').slice(1).join('</script>');
	const ranges = gated(markup);
	const figures = [
		...markup.matchAll(/~\{estimatedRewardsPer(Day|Week|Month)\b/g),
		...markup.matchAll(/Approx APR/g),
		...markup.matchAll(/estimatedRewardsPer\w+\s*\/\s*balance/g)
	];
	expect(figures).toHaveLength(5);
	for (const figure of figures)
		expect(
			ranges.some(([start, end]) => figure.index > start && figure.index < end),
			figure[0]
		).toBe(true);
	const apr = markup.indexOf('Approx APR');
	const row = markup.lastIndexOf('<p', apr);
	expect(ranges.some(([start, end]) => row > start && markup.indexOf('</p>', apr) < end)).toBe(
		true
	);
	expect(markup.match(/\bVOI\b/g)?.length).toBe(
		ranges.reduce(
			(count, [start, end]) => count + (markup.slice(start, end).match(/\bVOI\b/g)?.length ?? 0),
			0
		)
	);
});
