import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

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
			expect(source, `Call ${name}`).toMatch(new RegExp(`\\b${name}(?:<[^>]+>)?\\(`));
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
		const callbacks = [...source.matchAll(/onDestroy\(\(\) => \{([^]*?)\n\t\}\);/g)];
		expect(
			callbacks.some((callback) => /monitorController\?\.abort\(\)/.test(callback[1])),
			'Destroy must abort active requests inside its callback'
		).toBe(true);
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

describe('QR monitor isolation', () => {
	it('declares a separate controller and guards repeated QR starts', () => {
		expect(source).toMatch(/let depositController: AbortController \| undefined/);
		expect(functionBody('startQrMonitoring')).toMatch(/if \(qrMonitorActive[^]*?return/);
		for (const name of ['startQrMonitoring', 'monitorAlgorandTransactions']) {
			expect(functionBody(name)).not.toContain('monitorController');
		}
	});
	it.each(['resetBridgeState', 'goBack', 'closeModal'])('aborts both monitors in %s', (name) => {
		for (const controller of ['depositController', 'monitorController']) {
			expect(functionBody(name)).toContain(`${controller}?.abort()`);
		}
	});
	it('aborts both monitors on destruction', () => {
		const callbacks = [...source.matchAll(/onDestroy\(\(\) => \{([^]*?)\n\t\}\);/g)];
		expect(
			callbacks.some(
				([body]) =>
					body.includes('depositController?.abort()') && body.includes('monitorController?.abort()')
			)
		).toBe(true);
	});
	it('reacts only to the QR display and bridge direction', () => {
		const line = source
			.split('\n')
			.find((line) => line.includes('$: if (showQrCode && !isVoiToAlgorand)'));
		expect(line?.trim()).toBe('$: if (showQrCode && !isVoiToAlgorand) startQrMonitoring();');
		expect(line).not.toMatch(
			/dotsInterval|remainingChecks|bridgeMonitorInterval|isMonitoringAlgorand/
		);
	});
	it('hands off with the captured destination rather than live form defaults', () => {
		expect(functionBody('monitorAlgorandTransactions')).toMatch(
			/startBridgeMonitoring\([^,]+,\s*\{\s*\.\.\.capturedDestination,\s*sourceTxId:/
		);
	});
});

// Run the actual component functions, following RecipientInfo.stale.test.ts.
function qrHarness() {
	const deposit = Promise.withResolvers<unknown>();
	const destination = Promise.withResolvers<unknown>();
	const pollUntil = vi
		.fn()
		.mockReturnValueOnce(deposit.promise)
		.mockReturnValue(destination.promise);
	const checkAlgorandDeposit = vi.fn().mockResolvedValue({ done: false });
	const context = createContext({
		AbortController,
		Date,
		pollUntil,
		checkAlgorandDeposit,
		getJson: vi.fn(),
		checkDestinationConfirmation: vi.fn(),
		triggerCelebration: vi.fn(),
		window: { setInterval: vi.fn(() => 1) },
		clearInterval: vi.fn(),
		depositController: undefined,
		monitorController: undefined,
		qrMonitorActive: false,
		depositExpected: undefined,
		depositAfterTime: undefined,
		depositDestination: undefined,
		depositState: { startRound: null },
		monitorExpected: undefined,
		monitorSourceTxId: undefined,
		monitorIndexerBase: undefined,
		monitorState: 'checking',
		monitorReview: null,
		remainingChecks: 3,
		showQrCode: true,
		isVoiToAlgorand: false,
		isMonitoringAlgorand: false,
		dotsInterval: undefined,
		monitoringDots: '',
		bridgeStatus: 'idle',
		bridgeDetails: null,
		selectedToken: { algorandAssetId: '123', voiAssetId: '456' },
		BRIDGE_ADDRESS: 'BRIDGE',
		amountInAtomicUnits: 1000,
		destinationAmount: 900,
		voiDestinationAddress: 'ORIGINAL',
		algorandDestinationAddress: '',
		algorandSourceAddress: 'SENDER'
	});
	const names = [
		'startQrMonitoring',
		'monitorAlgorandTransactions',
		'startBridgeMonitoring',
		'updateDots'
	];
	runInContext(
		ts.transpileModule(names.map(functionBody).join('\n'), {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	return {
		run: (code: string) => runInContext(code, context),
		deposit,
		destination,
		pollUntil,
		checkAlgorandDeposit
	};
}

it('keeps the destination monitor alive through a repeated QR trigger after hand-off', async () => {
	vi.useFakeTimers();
	try {
		const { run, deposit, destination, pollUntil } = qrHarness();
		run('startQrMonitoring()');
		expect(run('qrMonitorActive')).toBe(true);
		const depositController = run('depositController') as AbortController;
		run('startQrMonitoring()');
		expect(pollUntil).toHaveBeenCalledOnce();
		run(
			"voiDestinationAddress = 'EDITED'; destinationAmount = 1; selectedToken = { algorandAssetId: '999', voiAssetId: '999' }"
		);
		deposit.resolve({ status: 'done', value: { id: 'DEPOSIT' } });
		await vi.advanceTimersByTimeAsync(0);
		expect(depositController.signal.aborted).toBe(true);
		expect(run('qrMonitorActive')).toBe(false);
		expect(run('monitorExpected')).toMatchObject({
			sourceTxId: 'DEPOSIT',
			sourceNetwork: 416001,
			destinationAddress: 'ORIGINAL',
			destinationAssetId: '456',
			destinationAmount: 900
		});
		const monitorController = run('monitorController') as AbortController;
		expect(monitorController.signal.aborted).toBe(false);
		// Even a repeated trigger with the active flag still set cannot restart deposits.
		run('qrMonitorActive = true; startQrMonitoring()');
		expect(monitorController.signal.aborted).toBe(false);
		expect(pollUntil).toHaveBeenCalledTimes(2);
		run('qrMonitorActive = false; startQrMonitoring()');
		expect(monitorController.signal.aborted).toBe(false);
		expect(pollUntil).toHaveBeenCalledTimes(2);
		destination.resolve({ status: 'timeout' });
		await vi.advanceTimersByTimeAsync(0);
	} finally {
		vi.useRealTimers();
	}
});

it('retains the QR timestamp and both expectations on deposit retry', async () => {
	vi.useFakeTimers();
	try {
		const { run, deposit, destination, pollUntil, checkAlgorandDeposit } = qrHarness();
		const before = Date.now();
		run('startQrMonitoring()');
		const afterTime = run('depositAfterTime');
		expect(afterTime).toBe(new Date(before - 30000).toISOString());
		const first = pollUntil.mock.calls[0][0];
		await first.check(first.signal);
		deposit.resolve({ status: 'timeout' });
		await vi.advanceTimersByTimeAsync(0);
		run("voiDestinationAddress = 'EDITED'; destinationAmount = 1; amountInAtomicUnits = 1");
		const retry = run('monitorAlgorandTransactions(true)') as Promise<void>;
		const second = pollUntil.mock.calls[1][0];
		await second.check(second.signal);
		expect(checkAlgorandDeposit.mock.calls.map((call) => call.slice(1, 3))).toEqual([
			[
				{
					assetId: 123,
					bridgeAddress: 'BRIDGE',
					amount: 1000,
					destinationAddress: 'ORIGINAL',
					sourceAddress: 'SENDER'
				},
				afterTime
			],
			[
				{
					assetId: 123,
					bridgeAddress: 'BRIDGE',
					amount: 1000,
					destinationAddress: 'ORIGINAL',
					sourceAddress: 'SENDER'
				},
				afterTime
			]
		]);
		destination.resolve({ status: 'done', value: { id: 'DEPOSIT' } });
		await retry;
		expect(run('monitorExpected')).toMatchObject({
			destinationAddress: 'ORIGINAL',
			destinationAmount: 900
		});
	} finally {
		vi.useRealTimers();
	}
});
