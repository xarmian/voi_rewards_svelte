import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beforeEach, expect, test, vi } from 'vitest';
import { render } from 'svelte/server';

// The switch-on calculator, unmocked: reads start in today's order and the epoch cards render.
const order = vi.hoisted(() => [] as string[]);
vi.mock('$lib/stores/accounts', () => ({
	requireAccountInfo: async () => {
		order.push('balance');
		return { amount: 1e9 };
	},
	getAccountInfo: async () => ({ amount: 1e9 }),
	getSupplyInfo: async () => {
		order.push('supply');
		return { 'online-money': 1e12 };
	}
}));
vi.mock('$lib/stores/price', async () => {
	const { writable } = await import('svelte/store');
	return {
		fetchVoiPrice: async () => {
			order.push('price');
		},
		voiPrice: writable({ price: 0.001, error: null, lastUpdated: null })
	};
});
vi.mock('$lib/utils', () => ({ getTokensByEpoch: async () => 10 }));
vi.mock('./dataTable', () => ({
	dataTable: {
		fetchDateRanges: async () => {
			order.push('dates');
			return [{ id: 'latest', epoch: 104 }];
		},
		fetchData: async () => ({ blacklist_balance_total: 0 })
	}
}));
import { epochCalculator } from '$lib/epochRewards/client';
import { createReadSource } from '$lib/wallet/read';
import { loadCalculatorBalance, loadCalculatorPrice } from '$lib/wallet/calculator';
import CalculatorComponent from '$lib/component/CalculatorComponent.svelte';
import CalculatorPage from '../../routes/(site)/calculator/+page.svelte';

beforeEach(() => {
	order.length = 0;
});

const source = readFileSync(
	new URL('../component/CalculatorComponent.svelte', import.meta.url),
	'utf8'
);

test('the epoch read starts before the balance and price reads', async () => {
	const script = source.split('<script lang="ts">')[1].split('</script>')[0];
	const ast = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true);
	const names = ['epochCalc', 'balanceReader', 'priceReader'];
	const code = ast.statements
		.filter(
			(node) =>
				(ts.isVariableStatement(node) &&
					node.declarationList.declarations.some(
						(d) => ts.isIdentifier(d.name) && names.includes(d.name.text)
					)) ||
				(ts.isFunctionDeclaration(node) && node.name?.text === 'changeAddress')
		)
		.map((node) => ts.transpile(node.getText(ast)))
		.join('\n');
	const context = {
		epochCalculator,
		createReadSource,
		loadCalculatorBalance,
		loadCalculatorPrice,
		applyBalance: () => {}
	};
	runInNewContext(`${code}\nchangeAddress("Y")`, context);
	expect(order).toEqual(['supply', 'dates', 'balance', 'price']);
	await new Promise((resolve) => setTimeout(resolve, 0));
	const calc = (
		context as unknown as { epochCalc: NonNullable<ReturnType<typeof epochCalculator>> }
	).epochCalc;
	expect(calc.state.network.state).toBe('ready');
	expect(calc.state.epochSchedule).toHaveLength(52);
	calc.dispose();
});

const text = (html: string) =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ');

test('the epoch cost field, estimate and schedule render under their old titles', () => {
	const html = render(CalculatorComponent).body;
	const shown = text(html);
	for (const title of [
		'Cost and price',
		'Monthly node cost (USD)',
		'Your estimated rewards',
		'View Reward Schedule',
		'Download CSV'
	])
		expect(shown).toContain(title);
	expect(html).toContain('aria-label="Cost and price"');
	expect(html).toContain('class="space-y-3 border-t border-line pt-4"');
	const clean = html.replace(/<!--[\s\S]*?-->/g, '');
	const estimate = clean.indexOf('aria-labelledby="estimated-rewards-heading"');
	const blocks = clean.indexOf('aria-labelledby="estimated-block-rewards-heading"');
	const schedule = clean.indexOf('View Reward Schedule');
	expect(estimate).toBeGreaterThan(clean.indexOf('Monthly node cost'));
	expect(blocks).toBeGreaterThan(estimate);
	expect(schedule).toBeGreaterThan(blocks);
});

test('the epoch estimate keeps its four disclaimer lines, once', () => {
	for (const walletAddress of [undefined, 'Y']) {
		const shown = text(render(CalculatorComponent, { props: { walletAddress } }).body);
		for (const line of [
			'* Calculations assume current network conditions and weekly compounding of rewards.',
			'* Actual rewards and rates may vary based on network participation and other factors.',
			'* This tool is for entertainment purposes only. It is not financial advice.',
			'Market price timestamp unavailable.'
		])
			expect(shown.split(line)).toHaveLength(2);
		expect(shown).not.toContain('* Calculations assume current network conditions. ');
	}
});

test('the calculator page keeps its node rewards and costs subtitle', () => {
	expect(text(render(CalculatorPage).body)).toContain(
		'Estimate your node rewards and costs at your chosen stake and VOI price.'
	);
});
