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
	it('stores QR windows by key without recreating them on a plain restart', () => {
		for (const removed of ['depositAfterTime', 'after-time', '/health']) {
			expect(source).not.toContain(removed);
		}
		expect(source).toMatch(/const depositSessions = new Map<\s*string,/);
		const start = functionBody('startQrMonitoring');
		expect(start).toContain('depositSessions.get(key)');
		expect(start).toContain('depositSessions.set(key, session)');
		expect(start).toMatch(/startedAtMs: performance\.now\(\),\s*startedAtWallMs: Date\.now\(\)/);
		expect(start).not.toMatch(/depositState =/);
		const monitor = functionBody('monitorAlgorandTransactions');
		expect(monitor).toMatch(/nowMs: \(\) => performance\.now\(\)/);
		expect(monitor).toMatch(/wallMs: \(\) => Date\.now\(\)/);
		expect(monitor).toContain('https://mainnet-api.4160.nodely.dev');
	});
	it('compares the running expectation key before deciding to restart', () => {
		const start = functionBody('startQrMonitoring');
		expect(source).toMatch(/let qrMonitorKey/);
		expect(start).toMatch(/qrMonitorActive && [^\n]*qrMonitorKey[^\n]*return/);
		for (const value of [
			'amountInAtomicUnits',
			'destinationAmount',
			'destinationAddress',
			'selectedToken.algorandAssetId',
			'selectedToken.voiAssetId',
			'algorandSourceAddress'
		]) {
			expect(start).toContain(value);
		}
	});
	it('hides the QR on close so Create can trigger monitoring again', () => {
		expect(functionBody('closeModal')).toContain('showQrCode = false');
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
		performance: { now: vi.fn(() => 1234) },
		Date: { now: vi.fn(() => 50000) },
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
		depositSessions: new Map(),
		qrMonitorKey: undefined,
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
		pendingController: undefined,
		tracker: undefined,
		dispatch: vi.fn(),
		selectedToken: { algorandAssetId: '123', voiAssetId: '456' },
		BRIDGE_ADDRESS: 'BRIDGE',
		amountInAtomicUnits: 1000,
		destinationAmount: 900,
		destinationAddress: 'ORIGINAL',
		emptyDestination: { text: '', address: null, name: null, error: null },
		algorandSourceAddress: 'SENDER'
	});
	const names = [
		'startQrMonitoring',
		'monitorAlgorandTransactions',
		'startBridgeMonitoring',
		'updateDots',
		'resetBridgeState',
		'closeModal',
		'goBack'
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
			"destinationAddress = 'EDITED'; destinationAmount = 1; selectedToken = { algorandAssetId: '999', voiAssetId: '999' }"
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
		expect(run('depositSessions.size')).toBe(0);
		expect(run('qrMonitorKey')).toBeUndefined();
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

it('retains the QR round window and both expectations on deposit retry', async () => {
	vi.useFakeTimers();
	try {
		const { run, deposit, destination, pollUntil, checkAlgorandDeposit } = qrHarness();
		run('startQrMonitoring()');
		const window = run('depositSessions.get(qrMonitorKey).state');
		expect(window).toEqual({
			startRound: null,
			scanFrom: null,
			startedAtMs: 1234,
			startedAtWallMs: 50000
		});
		run('depositSessions.get(qrMonitorKey).state.startRound = 98');
		const first = pollUntil.mock.calls[0][0];
		await first.check(first.signal);
		deposit.resolve({ status: 'timeout' });
		await vi.advanceTimersByTimeAsync(0);
		run("destinationAddress = 'EDITED'; destinationAmount = 1; amountInAtomicUnits = 1");
		const retry = run('monitorAlgorandTransactions(true)') as Promise<void>;
		const second = pollUntil.mock.calls[1][0];
		expect(run('depositSessions.get(qrMonitorKey).state')).toBe(window);
		expect(run('depositSessions.get(qrMonitorKey).state.startRound')).toBe(98);
		await second.check(second.signal);
		expect(checkAlgorandDeposit.mock.calls[0][2]).toBe(window);
		expect(checkAlgorandDeposit.mock.calls[1][2]).toBe(window);
		expect(checkAlgorandDeposit.mock.calls.map((call) => call.slice(1, 3))).toEqual([
			[
				{
					assetId: 123,
					bridgeAddress: 'BRIDGE',
					amount: 1000,
					destinationAddress: 'ORIGINAL',
					sourceAddress: 'SENDER'
				},
				window
			],
			[
				{
					assetId: 123,
					bridgeAddress: 'BRIDGE',
					amount: 1000,
					destinationAddress: 'ORIGINAL',
					sourceAddress: 'SENDER'
				},
				window
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

it.each([
	['amountInAtomicUnits = 2000', { amount: 2000 }],
	['destinationAmount = 800', {}],
	["destinationAddress = 'NEW'", { destinationAddress: 'NEW' }],
	["selectedToken = { algorandAssetId: '789', voiAssetId: '456' }", { assetId: 789 }],
	["selectedToken = { algorandAssetId: '123', voiAssetId: '789' }", {}],
	["algorandSourceAddress = 'NEW_SENDER'", { sourceAddress: 'NEW_SENDER' }]
])('restarts an active QR watch for changed expectations: %s', async (edit, changed) => {
	const { run, deposit, destination, pollUntil, checkAlgorandDeposit } = qrHarness();
	// A QR restart must never abort the independent destination controller.
	const destinationController = run('monitorController = new AbortController()') as AbortController;
	run('startQrMonitoring()');
	const firstController = run('depositController') as AbortController;
	const firstState = run('depositSessions.get(qrMonitorKey).state');
	run('startQrMonitoring()');
	expect(pollUntil).toHaveBeenCalledOnce();
	expect(firstController.signal.aborted).toBe(false);
	expect(destinationController.signal.aborted).toBe(false);
	run('showQrCode = false');
	run(edit);
	run('showQrCode = true; startQrMonitoring()');
	expect(firstController.signal.aborted).toBe(true);
	expect(pollUntil).toHaveBeenCalledTimes(2);
	expect(destinationController.signal.aborted).toBe(false);
	const secondController = run('depositController') as AbortController;
	expect(secondController).not.toBe(firstController);
	expect(secondController.signal.aborted).toBe(false);
	expect(run('depositSessions.get(qrMonitorKey).state')).not.toBe(firstState);
	expect(run('depositSessions.get(qrMonitorKey).state')).toEqual({
		startRound: null,
		scanFrom: null,
		startedAtMs: 1234,
		startedAtWallMs: 50000
	});
	const second = pollUntil.mock.calls[1][0];
	await second.check(second.signal);
	expect(checkAlgorandDeposit.mock.calls[0][1]).toMatchObject({
		assetId: 123,
		amount: 1000,
		destinationAddress: 'ORIGINAL',
		sourceAddress: 'SENDER',
		...changed
	});
	if (edit.includes('voiAssetId')) {
		expect(run('depositSessions.get(qrMonitorKey).destination.destinationAssetId')).toBe(
			edit.includes("voiAssetId: '789'") ? '789' : '456'
		);
	}
	// A stale completion from the aborted request cannot hand off or stop its replacement.
	deposit.resolve({ status: 'done', value: { id: 'STALE' } });
	await Promise.resolve();
	expect(run('depositController')).toBe(secondController);
	expect(run('qrMonitorActive')).toBe(true);
	expect(run('bridgeStatus')).toBe('idle');
	secondController.abort();
	destination.resolve({ status: 'aborted' });
});

it.each(['countdown', 'timeout', 'inactive'] as const)(
	'reuses the same QR state when reopened after %s',
	async (stop) => {
		vi.useFakeTimers();
		try {
			const { run, deposit, destination, pollUntil, checkAlgorandDeposit } = qrHarness();
			run('startQrMonitoring()');
			const window = run('depositSessions.get(qrMonitorKey).state');
			const expected = run('depositSessions.get(qrMonitorKey).expected');
			const capturedDestination = run('depositSessions.get(qrMonitorKey).destination');
			const key = run('qrMonitorKey');
			const first = pollUntil.mock.calls[0][0];
			await first.check(first.signal);
			run(
				'depositSessions.get(qrMonitorKey).state.startRound = 98; depositSessions.get(qrMonitorKey).state.scanFrom = 110; showQrCode = false'
			);
			if (stop === 'countdown') {
				for (let i = 0; i < 3; i++) {
					await first.check(first.signal);
					expect(first.signal.aborted).toBe(i === 2);
				}
				deposit.resolve({ status: 'aborted' });
			} else if (stop === 'timeout') {
				deposit.resolve({ status: 'timeout' });
			} else {
				run('qrMonitorActive = false');
			}
			await vi.advanceTimersByTimeAsync(0);
			for (const [name, value] of Object.entries({
				'depositSessions.get(qrMonitorKey).state': window,
				'depositSessions.get(qrMonitorKey).expected': expected,
				'depositSessions.get(qrMonitorKey).destination': capturedDestination,
				qrMonitorKey: key
			})) {
				expect(run(name)).toBe(value);
			}
			run(
				'performance.now.mockReturnValue(41234); Date.now.mockReturnValue(90000); showQrCode = true; startQrMonitoring()'
			);
			expect(pollUntil).toHaveBeenCalledTimes(2);
			const second = pollUntil.mock.calls[1][0];
			await second.check(second.signal);
			expect(run('depositSessions.get(qrMonitorKey).state')).toBe(window);
			expect(run('depositSessions.get(qrMonitorKey).state')).toEqual({
				startRound: 98,
				scanFrom: 110,
				startedAtMs: 1234,
				startedAtWallMs: 50000
			});
			expect(checkAlgorandDeposit.mock.calls.at(-1)?.[2]).toBe(window);
			expect(checkAlgorandDeposit.mock.calls[0][2]).toBe(window);
			expect(run('depositSessions.get(qrMonitorKey).expected')).toBe(expected);
			expect(run('depositSessions.get(qrMonitorKey).destination')).toBe(capturedDestination);
			expect(run('remainingChecks')).toBe(3);
			deposit.resolve({ status: 'aborted' });
			destination.resolve({ status: 'aborted' });
			await vi.advanceTimersByTimeAsync(0);
		} finally {
			vi.useRealTimers();
		}
	}
);

it.each(['resetBridgeState', 'closeModal', 'goBack'])(
	'clears every QR session and aborts monitoring in %s',
	async (name) => {
		const { run, deposit, destination } = qrHarness();
		try {
			run("startQrMonitoring(); destinationAddress = 'B'; startQrMonitoring()");
			const controller = run('depositController') as AbortController;
			expect(run('depositSessions.size')).toBe(2);
			run(`${name}()`);
			expect(controller.signal.aborted).toBe(true);
			expect(run('depositSessions.size')).toBe(0);
			expect(run('qrMonitorKey')).toBeUndefined();
		} finally {
			run('depositController?.abort()');
			deposit.resolve({ status: 'aborted' });
			destination.resolve({ status: 'aborted' });
			await Promise.resolve();
		}
	}
);

it('reuses A after A -> B -> A and evicts the least recently used of six keys', async () => {
	const { run, deposit, destination, pollUntil, checkAlgorandDeposit } = qrHarness();
	const start = async (address: string) => {
		run(
			`showQrCode = false; destinationAddress = ${JSON.stringify(address)}; showQrCode = true; startQrMonitoring()`
		);
		const poll = pollUntil.mock.calls.at(-1)?.[0];
		await poll.check(poll.signal);
		return run('qrMonitorKey');
	};
	try {
		const a = await start('A');
		const firstState = checkAlgorandDeposit.mock.calls.at(-1)?.[2];
		run(
			'depositSessions.get(qrMonitorKey).state.startRound = 98; depositSessions.get(qrMonitorKey).state.scanFrom = 110'
		);
		const b = await start('B');
		run('performance.now.mockReturnValue(41234); Date.now.mockReturnValue(90000)');
		expect(await start('A')).toBe(a);
		expect(checkAlgorandDeposit.mock.calls[2][2]).toBe(firstState);
		expect(firstState).toEqual({
			startRound: 98,
			scanFrom: 110,
			startedAtMs: 1234,
			startedAtWallMs: 50000
		});
		const c = await start('C');
		const d = await start('D');
		const e = await start('E');
		expect(run('depositSessions.size')).toBe(5);
		const f = await start('F');
		expect(run('Array.from(depositSessions.keys())')).toEqual([a, c, d, e, f]);
		expect(run(`depositSessions.has(${JSON.stringify(b)})`)).toBe(false);
	} finally {
		run('depositController?.abort()');
		deposit.resolve({ status: 'aborted' });
		destination.resolve({ status: 'aborted' });
		await Promise.resolve();
	}
});
