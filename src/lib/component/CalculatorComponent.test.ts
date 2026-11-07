import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { buildScheduleCsv, scheduleRows } from './calculatorSchedule';
const source = readFileSync(new URL('./CalculatorComponent.svelte', import.meta.url), 'utf8');
function harness() {
	const ast = ts.createSourceFile(
		'component.ts',
		source.split('<script lang="ts">')[1].split('</script>')[0],
		ts.ScriptTarget.Latest,
		true
	);
	const functions = ['applyBalance', 'syncPrice']
		.map((name) => {
			const fn = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
			expect(fn, `Missing function ${name}`).toBeDefined();
			return ts.transpile(fn!.getText(ast));
		})
		.join('\n');
	const context = {
		walletBalance: null as number | null,
		prefilled: false,
		stakeEdited: false,
		calculationAmount: 0,
		calculationAmountUSD: 10,
		sliderValue: 10,
		hasPrice: true,
		effectivePrice: 0.01,
		priceInitialized: false,
		walletAddress: 'Y',
		inputMode: 'voi'
	};
	return {
		context,
		run: (statement: string) => runInNewContext(`${functions}\n${statement}`, context)
	};
}
it('prefills zero once and keeps manual stake when price arrives or refreshes', () => {
	const h = harness();
	h.run('applyBalance(0); syncPrice()');
	expect(h.context.calculationAmount).toBe(0);
	h.context.calculationAmount = 123.456;
	h.context.stakeEdited = true;
	h.context.effectivePrice = 0.02;
	h.run('syncPrice(); applyBalance(0)');
	expect(h.context.calculationAmount).toBe(123.456);
	expect(h.context.calculationAmountUSD).toBeCloseTo(2.47);
});
it('retains standalone schedule and CSV shape', () => {
	const start = new Date('2024-10-30');
	expect(buildScheduleCsv([1400], start)).toBe(
		'startDate,endDate,nodeAamount,relayAmount\n2024-10-30,2024-11-05,1400,140'
	);
	expect(scheduleRows(Array(52).fill(1400), 1, start, start)).toHaveLength(52);
});
