import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./BridgeModal.svelte', import.meta.url), 'utf8');
const functionBody = (name: string) => {
	const body = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t}`))?.[0];
	expect(body, `Expected ${name} to exist`).toBeDefined();
	return body ?? '';
};

describe('BridgeModal monitoring wiring', () => {
	it('uses single-flight polling and leaves only the dots animation interval', () => {
		expect(source, 'Remove the legacy monitoring interval').not.toContain('bridgeMonitorInterval');
		expect(
			source.match(/(?:window\.)?setInterval\(/g),
			'Only dots may use setInterval'
		).toHaveLength(1);
		expect(source).toMatch(/setInterval\(updateDots, 500\)/);
		for (const name of ['pollUntil', 'checkDestinationConfirmation', 'checkAlgorandDeposit']) {
			expect(source, `Import ${name}`).toMatch(new RegExp(`import[^;]*\\b${name}\\b[^;]*from`));
			expect(source, `Call ${name}`).toMatch(new RegExp(`\\b${name}\\(`));
		}
	});
	it('removes the one-result query and fetch-error stop path', () => {
		expect(source, 'Do not hide confirmations behind limit=1').not.toMatch(/&limit=1(?:[`'"&]|\s)/);
		expect(source, 'Network errors must not stop monitoring silently').not.toMatch(
			/includes\(['"]Failed to fetch['"]\)/
		);
	});
	it.each(['resetBridgeState', 'goBack', 'closeModal'])('aborts monitoring in %s', (name) => {
		expect(functionBody(name), `${name} must abort the monitor`).toMatch(
			/monitorController\?\.abort\(\)/
		);
	});
	it('aborts monitoring on destruction', () => {
		expect(source, 'Destroy must abort active requests').toMatch(
			/onDestroy\(\(\) => \{[^]*?monitorController\?\.abort\(\)/
		);
	});
	it.each([
		"Can't check the bridge status right now",
		"We couldn't confirm this bridge from here",
		"Can't check Algorand right now",
		'Retry'
	])('renders status text: %s', (text) => {
		expect(source, `Missing visible monitoring message: ${text}`).toContain(text);
	});
	it('retries with captured expectations and source transaction', () => {
		const retry = functionBody('retryMonitoring');
		expect(retry, 'Retry must abort the previous monitor').toMatch(
			/monitorController\?\.abort\(\)/
		);
		expect(retry, 'Retry must retain the original bridge expectations').toMatch(
			/startBridgeMonitoring\([^;]*monitorSourceTxId[^;]*monitorExpected/
		);
		expect(retry, 'Retry must clear the review').toMatch(/monitorReview = null/);
	});
	it('marks completed exactly once and only after done', () => {
		const completed = [...source.matchAll(/bridgeStatus = 'completed'/g)];
		expect(completed, 'Completion must have a single proven path').toHaveLength(1);
		const position = completed[0]?.index ?? 0;
		expect(
			source.slice(Math.max(0, position - 300), position),
			'Completion must be guarded by done'
		).toMatch(/if\s*\([^)]*\.status === 'done'\)/);
	});
});
