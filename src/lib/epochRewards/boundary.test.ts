import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, test } from 'vitest';

const root = new URL('../../../', import.meta.url).pathname;
const moduleDir = 'src/lib/epochRewards/';

function files(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
	});
}

const sources = files(join(root, 'src'))
	.filter((file) => /\.(ts|js|svelte)$/.test(file))
	.map((file) => ({ path: relative(root, file), text: readFileSync(file, 'utf8') }));
const isTest = (path: string) => /\.test\.ts$/.test(path);
const outside = sources.filter(({ path }) => !path.startsWith(moduleDir));

function specifiers(text: string): string[] {
	return [
		...text.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g),
		...text.matchAll(/\bimport\s*\(?\s*(['"])([^'"]+)\1/g),
		...text.matchAll(/\bvi\.(?:mock|doMock)\(\s*(['"])([^'"]+)\1/g)
	].map((match) => match[2]);
}

/** A relative specifier that lands in the module, rewritten as its `$lib/epochRewards` form. */
function normalize(path: string, spec: string): string {
	if (!spec.startsWith('.')) return spec;
	const target = relative(root, resolve(root, dirname(path), spec)).replace(
		/\.(ts|js|svelte)$/,
		''
	);
	if (target === moduleDir.slice(0, -1) || target === `${moduleDir}index`)
		return '$lib/epochRewards';
	return target.startsWith(moduleDir)
		? `$lib/epochRewards/${target.slice(moduleDir.length)}`
		: spec;
}

test('relative imports into the module are checked like $lib ones', () => {
	expect(normalize('src/lib/home/x.ts', '../epochRewards/headline')).toBe(
		'$lib/epochRewards/headline'
	);
	expect(normalize('src/routes/(site)/x.svelte', '../../lib/epochRewards')).toBe(
		'$lib/epochRewards'
	);
	expect(normalize('src/lib/home/x.ts', '../epochRewards/index.ts')).toBe('$lib/epochRewards');
	expect(normalize('src/lib/home/x.ts', './headline')).toBe('./headline');
});

/** The epoch-rewards internals that only the module may reach. */
function internals(text: string): string[] {
	const hits = new Set<string>();
	for (const spec of specifiers(text))
		for (const path of [
			'stores/dataTable',
			'rewards/calculateEpochRewards',
			'utils/epoch-utils',
			'ds/EpochStepper'
		])
			if (spec.includes(path)) hits.add(path);
	for (const name of ['getTokensByEpoch', 'extrapolateRewardPerBlock'])
		if (new RegExp(`\\b${name}\\b`).test(text)) hits.add(name);
	if (text.includes('/api/epochs')) hits.add('/api/epochs');
	return [...hits];
}

/** 1b: these files move into the module (or onto its components), and these imports go with them. */
const DEEP_1B: Record<string, string[]> = {
	'src/routes/(site)/HomeTop.svelte': ['headline'],
	'src/routes/(site)/HomeRewards.svelte': ['headline', 'table', 'balance']
};

test('code outside the module reaches epoch rewards only through its public entries', () => {
	const violations: string[] = [];
	for (const { path, text } of outside)
		for (const spec of specifiers(text).map((raw) => normalize(path, raw))) {
			if (/^\$lib\/(epochs|home\/rewards|home\/balance)$/.test(spec))
				violations.push(`${path}: ${spec} moved into $lib/epochRewards`);
			if (!spec.startsWith('$lib/epochRewards/')) continue;
			const entry = spec.slice('$lib/epochRewards/'.length);
			if (entry === 'components' || DEEP_1B[path]?.includes(entry)) continue;
			if (entry === 'home.server' && path.startsWith('src/lib/server/')) continue;
			if (entry === 'config' && isTest(path)) continue;
			violations.push(`${path}: ${spec}`);
		}
	expect(violations).toEqual([]);
});

test('the epoch half of the home headline lives in the module', () => {
	const moved = ['blocksForEpoch', 'deriveHeadline', 'headlineValues', 'accountsDetail'];
	const headline = readFileSync(join(root, 'src/lib/home/headline.ts'), 'utf8');
	for (const name of [...moved, 'rewardsRefreshMode', 'type Epoch'])
		expect(headline, `${name} belongs in ${moduleDir}headline.ts`).not.toMatch(
			new RegExp(`export (function |const )?${name}\\b`)
		);
});

const homeSurfaces = (path: string) =>
	[
		'src/routes/(site)/+page.svelte',
		'src/routes/(site)/HomeTop.svelte',
		'src/routes/(site)/+page.server.ts',
		'src/routes/(site)/+layout.svelte',
		'src/lib/server/home.ts'
	].includes(path) ||
	path.startsWith('src/lib/home/') ||
	path.startsWith('src/lib/ds/Header/');

/**
 * Files outside the module that still reach the internals. Each later change shrinks
 * this list; a new entry means new code bypassed the module.
 */
const PENDING = {
	// 1b: the home epoch load and the rewards table move into the module.
	'1b': ['src/routes/(site)/HomeRewards.svelte'],
	// PR 2: wallet, calculator, node and analytics surfaces.
	'PR 2': [
		'src/lib/component/CalculatorComponent.svelte',
		'src/lib/component/NodeComponent.svelte',
		'src/lib/component/PortfolioComponent.svelte',
		'src/lib/component/TransactionExportPanel.svelte',
		'src/lib/ds/WalletOverview/WalletOverview.svelte',
		'src/lib/network/model.ts',
		'src/lib/utils.ts',
		'src/lib/wallet/calculator.ts',
		'src/lib/wallet/load.ts',
		'src/lib/wallet/rewards.ts'
	],
	// PR 2 decides: the TestNet archive keeps its own reward pools.
	archive: [
		'src/routes/(site)/archive/testnet/relays/+page.svelte',
		'src/routes/api/relay-rewards/+server.ts'
	]
};

test('the home and header surfaces reach no epoch internals outside the pending list', () => {
	const hits = outside
		.filter(({ path, text }) => !isTest(path) && homeSurfaces(path) && internals(text).length)
		.map(({ path }) => path);
	expect(hits).toEqual(PENDING['1b'].filter((path) => homeSurfaces(path)));
});

test('the set of files still reaching epoch internals only shrinks', () => {
	const hits = outside
		.filter(({ path, text }) => !isTest(path) && internals(text).length)
		.map(({ path }) => path)
		.sort();
	expect(hits).toEqual(Object.values(PENDING).flat().sort());
});
