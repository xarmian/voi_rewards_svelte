import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	main,
	parseSvelteCheck,
	parseEslint,
	compareCounts,
	serializeBaseline
} from './quality-ratchet.mjs';

const empty = () => ({ 'svelte-check': {}, eslint: {} });
const counts = (errors: number, warnings = 0, identity = 'rule-a') => ({
	[identity]: { errors, warnings }
});
const completed = '101 COMPLETED 1 FILES 1 ERRORS 0 WARNINGS 1 FILES_WITH_PROBLEMS';
const svelteDiagnostic = (overrides = {}) =>
	`100 ${JSON.stringify({
		type: 'ERROR',
		filename: 'src/a.ts',
		start: { line: 0, character: 1 },
		end: { line: 0, character: 2 },
		message: 'error',
		code: 2322,
		source: 'ts',
		...overrides
	})}`;

// An ignored injection must fail safely rather than launch tools against the working tree.
vi.mock('node:child_process', () => ({
	spawnSync: () => {
		throw new Error('Tests must use the injected run');
	}
}));

type RunResult = {
	status: number | null;
	stdout: string;
	stderr: string;
	error?: Error;
	signal: string | null;
};

function mainFixture(baseline = empty()) {
	let baselineText = JSON.stringify(baseline);
	const outputs: Record<string, RunResult> = {
		'svelte-check': {
			status: 0,
			stdout: '100 COMPLETED 0 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS',
			stderr: '',
			signal: null
		},
		eslint: { status: 0, stdout: '[]', stderr: '', signal: null }
	};
	const deps = {
		run: vi.fn((command: string, args: string[], env: NodeJS.ProcessEnv) => {
			expect(env).toBeDefined();
			if (command === 'npx' && outputs[args[0]]) return outputs[args[0]];
			return { status: 0, stdout: '', stderr: '', signal: null };
		}),
		readBaseline: vi.fn(() => baselineText),
		writeBaseline: vi.fn((text: string) => {
			baselineText = text;
		}),
		log: vi.fn(),
		error: vi.fn()
	};
	return { deps, outputs };
}

describe('main exit decisions', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('returns 0 without writing for equal counts', () => {
		const { deps } = mainFixture();
		expect(main([], deps)).toBe(0);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.log).toHaveBeenCalledWith('quality-ratchet: equal');
	});

	it('returns 1 without writing and logs RISE for an increase', () => {
		const { deps, outputs } = mainFixture();
		outputs.eslint.status = 1;
		outputs.eslint.stdout = JSON.stringify([
			{ filePath: 'src/a.ts', messages: [{ ruleId: 'rule-a', severity: 2, message: 'error' }] }
		]);
		expect(main([], deps)).toBe(1);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.log).toHaveBeenCalledWith('RISE eslint src/a.ts rule-a errors 0 -> 1');
	});

	it('returns 0 and writes the lowered baseline for a drop', () => {
		const { deps } = mainFixture({ ...empty(), eslint: { 'src/a.ts': counts(1) } });
		expect(main([], deps)).toBe(0);
		expect(deps.log).toHaveBeenCalledWith('DROP eslint src/a.ts rule-a errors 1 -> 0');
		expect(deps.writeBaseline).toHaveBeenCalledTimes(1);
		expect(JSON.parse(deps.readBaseline())).toEqual(empty());
	});

	it('returns 1 without writing for a drop with --frozen', () => {
		const { deps } = mainFixture({ ...empty(), eslint: { 'src/a.ts': counts(1) } });
		expect(main(['--frozen'], deps)).toBe(1);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
	});

	it('returns 0 and writes current counts for a rise with --update', () => {
		const { deps, outputs } = mainFixture();
		outputs['svelte-check'].status = 1;
		outputs['svelte-check'].stdout = `${svelteDiagnostic()}\n${completed}`;
		expect(main(['--update'], deps)).toBe(0);
		expect(deps.writeBaseline).toHaveBeenCalledTimes(1);
		expect(JSON.parse(deps.readBaseline())).toEqual({
			...empty(),
			'svelte-check': { 'src/a.ts': counts(1, 0, 'ts:2322') }
		});
	});

	it('returns 2 without writing or reporting zero when svelte-check lacks COMPLETED', () => {
		const { deps, outputs } = mainFixture();
		outputs['svelte-check'].stdout = '';
		expect(main([], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('missing COMPLETED'));
		expect(deps.log).toHaveBeenCalledWith(
			expect.stringContaining('svelte-check unknown errors unknown warnings')
		);
	});

	it.each([2, 3, null])('returns 2 without writing for svelte-check status %s', (status) => {
		const { deps, outputs } = mainFixture();
		outputs['svelte-check'].status = status;
		expect(main([], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('svelte-check'));
	});

	it.each(['tool crashed', '{}', '[{}]'])(
		'returns 2 without writing for invalid ESLint JSON results: %s',
		(stdout) => {
			const { deps, outputs } = mainFixture();
			outputs.eslint.stdout = stdout;
			expect(main([], deps)).toBe(2);
			expect(deps.writeBaseline).not.toHaveBeenCalled();
			expect(deps.error).toHaveBeenCalledWith(
				expect.stringContaining('ESLint did not produce valid completed JSON results')
			);
			expect(deps.log).toHaveBeenCalledWith(
				expect.stringContaining('eslint unknown errors unknown warnings')
			);
		}
	);

	it('returns 2 without writing for ESLint status 2 even with valid JSON', () => {
		const { deps, outputs } = mainFixture();
		outputs.eslint.status = 2;
		expect(main([], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith(
			expect.stringContaining('eslint . --format json failed')
		);
	});

	it('returns 2 without writing when run returns a spawn error', () => {
		const { deps, outputs } = mainFixture();
		outputs['svelte-check'].error = new Error('spawn failed');
		expect(main([], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('spawn failed'));
	});

	it('returns 2 without writing for an unknown argument', () => {
		const { deps } = mainFixture();
		expect(main(['--unknown'], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith('quality-ratchet: Unknown argument: --unknown');
		expect(deps.run).not.toHaveBeenCalled();
	});

	it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
		'returns 2 without writing for invalid baseline count %s',
		(count) => {
			const { deps } = mainFixture({ ...empty(), eslint: { 'src/a.ts': counts(count) } });
			expect(main([], deps)).toBe(2);
			expect(deps.writeBaseline).not.toHaveBeenCalled();
			expect(deps.error).toHaveBeenCalledWith(
				'quality-ratchet: Invalid baseline count: eslint src/a.ts rule-a errors'
			);
			expect(deps.run).not.toHaveBeenCalled();
		}
	);

	it('returns 0 and writes a missing baseline with --update', () => {
		const { deps } = mainFixture();
		deps.readBaseline.mockImplementationOnce(() => {
			throw Object.assign(new Error('baseline missing'), { code: 'ENOENT' });
		});
		expect(main(['--update'], deps)).toBe(0);
		expect(deps.writeBaseline).toHaveBeenCalledTimes(1);
		expect(JSON.parse(deps.readBaseline())).toEqual(empty());
	});

	it('returns 2 without writing for a missing baseline without --update', () => {
		const { deps } = mainFixture();
		deps.readBaseline.mockImplementationOnce(() => {
			throw Object.assign(new Error('baseline missing'), { code: 'ENOENT' });
		});
		expect(main([], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith('quality-ratchet: baseline missing');
		expect(deps.run).not.toHaveBeenCalled();
	});

	it('forces all seven environment variables to x for every command', () => {
		const forcedEnv = {
			PUBLIC_SUPABASE_URL: 'x',
			PUBLIC_SUPABASE_ANON_KEY: 'x',
			PUBLIC_MIMIR_URL: 'x',
			PUBLIC_MIMIR_ANON_KEY: 'x',
			PUBLIC_WALLETCONNECT_PROJECT_ID: 'x',
			PUBLIC_DS_GALLERY: 'x',
			PRIVATE_SUPABASE_ROLE_KEY: 'x'
		};
		for (const name of Object.keys(forcedEnv)) vi.stubEnv(name, 'inherited');
		const { deps } = mainFixture();
		expect(main([], deps)).toBe(0);
		expect(deps.run).toHaveBeenCalledTimes(4);
		for (const [, , env] of deps.run.mock.calls) {
			for (const name of Object.keys(forcedEnv)) expect(env[name]).toBe('x');
		}
		for (const name of Object.keys(forcedEnv)) expect(process.env[name]).toBe('inherited');
	});
});

describe('diagnostic identity regressions', () => {
	it('rejects a svelte-check code swap in the same file', () => {
		const { deps, outputs } = mainFixture({
			...empty(),
			'svelte-check': { 'src/a.ts': counts(1, 0, 'ts:2322') }
		});
		outputs['svelte-check'].status = 1;
		outputs['svelte-check'].stdout =
			`${svelteDiagnostic({ code: 2345, message: 'new error' })}\n${completed}`;
		expect(main([], deps)).toBe(1);
		expect(deps.log).toHaveBeenCalledWith('RISE svelte-check src/a.ts ts:2345 errors 0 -> 1');
		expect(deps.log).toHaveBeenCalledWith('  src/a.ts:1:2 new error');
		expect(deps.log).toHaveBeenCalledWith('DROP svelte-check src/a.ts ts:2322 errors 1 -> 0');
		expect(deps.writeBaseline).not.toHaveBeenCalled();
	});

	it('treats the same svelte-check error moved to a different line and column as equal', () => {
		const { deps, outputs } = mainFixture({
			...empty(),
			'svelte-check': { 'src/a.ts': counts(1, 0, 'ts:2322') }
		});
		outputs['svelte-check'].status = 1;
		outputs['svelte-check'].stdout =
			`${svelteDiagnostic({ start: { line: 42, character: 17 } })}\n${completed}`;
		expect(main([], deps)).toBe(0);
		expect(deps.log).toHaveBeenCalledWith('quality-ratchet: equal');
		expect(deps.writeBaseline).not.toHaveBeenCalled();
	});

	it('rejects an ESLint rule swap in the same file', () => {
		const { deps, outputs } = mainFixture({ ...empty(), eslint: { 'src/a.ts': counts(1) } });
		outputs.eslint.status = 1;
		outputs.eslint.stdout = JSON.stringify([
			{
				filePath: 'src/a.ts',
				messages: [{ ruleId: 'rule-b', severity: 2, line: 3, column: 4, message: 'new rule error' }]
			}
		]);
		expect(main([], deps)).toBe(1);
		expect(deps.log).toHaveBeenCalledWith('RISE eslint src/a.ts rule-b errors 0 -> 1');
		expect(deps.log).toHaveBeenCalledWith('  src/a.ts:3:4 new rule error');
		expect(deps.log).toHaveBeenCalledWith('DROP eslint src/a.ts rule-a errors 1 -> 0');
		expect(deps.writeBaseline).not.toHaveBeenCalled();
	});

	it('counts a null ESLint ruleId by its fatal message and rejects a rise', () => {
		const { deps, outputs } = mainFixture();
		outputs.eslint.status = 1;
		outputs.eslint.stdout = JSON.stringify([
			{
				filePath: 'src/a.ts',
				messages: [
					{ ruleId: null, severity: 2, fatal: true, message: 'Parsing error\nmore detail' }
				]
			}
		]);
		expect(main([], deps)).toBe(1);
		expect(deps.log).toHaveBeenCalledWith('RISE eslint src/a.ts fatal:Parsing error errors 0 -> 1');
		expect(deps.log).toHaveBeenCalledWith('  src/a.ts:0:0 Parsing error');
	});

	it('never offsets a rise with a different identity fixed in another file', () => {
		const { deps, outputs } = mainFixture({ ...empty(), eslint: { 'src/a.ts': counts(1) } });
		outputs.eslint.stdout = JSON.stringify([
			{ filePath: 'src/b.ts', messages: [{ ruleId: 'rule-b', severity: 2, message: 'new error' }] }
		]);
		expect(main([], deps)).toBe(1);
		expect(deps.log).toHaveBeenCalledWith('RISE eslint src/b.ts rule-b errors 0 -> 1');
		expect(deps.log).toHaveBeenCalledWith('DROP eslint src/a.ts rule-a errors 1 -> 0');
		expect(deps.writeBaseline).not.toHaveBeenCalled();
	});

	it('prints rise details only for the matching file, identity and severity', () => {
		const { deps, outputs } = mainFixture({
			...empty(),
			'svelte-check': {
				'src/a.ts': { ...counts(1, 0, 'ts:2322'), ...counts(0, 1, 'ts:2345') },
				'src/b.ts': counts(1, 0, 'ts:2345')
			}
		});
		outputs['svelte-check'].stdout = [
			svelteDiagnostic({ code: 2345, message: 'rise' }),
			svelteDiagnostic({ message: 'same file other identity' }),
			svelteDiagnostic({ code: 2345, type: 'WARNING', message: 'same identity other severity' }),
			svelteDiagnostic({ code: 2345, filename: 'src/b.ts', message: 'same identity other file' }),
			completed
		].join('\n');
		expect(main([], deps)).toBe(1);
		expect(deps.log.mock.calls.filter(([line]) => line.startsWith('  '))).toEqual([
			['  src/a.ts:1:2 rise']
		]);
		expect(deps.log).toHaveBeenLastCalledWith(
			'quality-ratchet: svelte-check 3 errors 1 warnings (baseline 2/1); eslint 0 errors 0 warnings (baseline 0/0)'
		);
	});

	it('rejects an old file/severity baseline with a clear error', () => {
		const { deps } = mainFixture({
			...empty(),
			eslint: { 'src/a.ts': { errors: 1, warnings: 0 } }
		});
		expect(main([], deps)).toBe(2);
		expect(deps.error).toHaveBeenCalledWith(
			expect.stringMatching(/old.*baseline.*diagnostic identity/i)
		);
		expect(deps.run).not.toHaveBeenCalled();
		expect(deps.writeBaseline).not.toHaveBeenCalled();
	});

	it.each(['100 {not json}', '100 {}', svelteDiagnostic({ start: null })])(
		'rejects a malformed diagnostic-looking svelte-check line: %s',
		(line) => {
			const { deps, outputs } = mainFixture();
			outputs['svelte-check'].stdout = `${line}\n${completed}`;
			expect(main([], deps)).toBe(2);
			expect(deps.error).toHaveBeenCalledWith(
				expect.stringContaining('Malformed svelte-check diagnostic')
			);
			expect(deps.writeBaseline).not.toHaveBeenCalled();
		}
	);

	it('ignores vite and npm noise and requests machine-verbose after preparation', () => {
		const { deps, outputs } = mainFixture();
		outputs['svelte-check'].stdout =
			`vite-plugin-svelte: notice\nnpm warn config Unknown config\n100 START "/repo"\n${completed}`;
		expect(main([], deps)).toBe(0);
		expect(deps.run.mock.calls.map(([, args]) => args)).toEqual([
			['scripts/generateFaqData.js'],
			['svelte-kit', 'sync'],
			['svelte-check', '--tsconfig', './tsconfig.json', '--output', 'machine-verbose'],
			['eslint', '.', '--format', 'json']
		]);
	});

	it.each([null, [], 1, 'bad'])('rejects a non-object baseline level: %s', (value) => {
		for (const baseline of [
			value,
			{ ...empty(), eslint: value },
			{ ...empty(), eslint: { 'src/a.ts': value } },
			{ ...empty(), eslint: { 'src/a.ts': { 'rule-a': value } } }
		]) {
			const { deps } = mainFixture();
			deps.readBaseline.mockReturnValue(JSON.stringify(baseline));
			expect(main([], deps)).toBe(2);
			expect(deps.run).not.toHaveBeenCalled();
			expect(deps.writeBaseline).not.toHaveBeenCalled();
		}
	});
});

describe('svelte-check machine-verbose output', () => {
	it('counts per file, source, code and severity and ignores noise', () => {
		const result = parseSvelteCheck(
			[
				'100 START "/repo"',
				svelteDiagnostic(),
				svelteDiagnostic({ start: { line: 4, character: 5 }, message: 'second error' }),
				svelteDiagnostic({ type: 'WARNING', message: 'warning' }),
				svelteDiagnostic({ source: 'svelte', code: 'state_referenced_locally' }),
				svelteDiagnostic({ filename: 'src/b.ts', source: 'svelte' }),
				'vite-plugin-svelte: notice',
				'npm warn config Unknown config',
				completed
			].join('\n')
		);
		expect(result.completed).toBe(true);
		expect(result.counts).toEqual({
			'src/a.ts': {
				...counts(2, 1, 'ts:2322'),
				...counts(1, 0, 'svelte:state_referenced_locally')
			},
			'src/b.ts': counts(1, 0, 'svelte:2322')
		});
		expect(result.diagnostics[0]).toEqual({
			file: 'src/a.ts',
			identity: 'ts:2322',
			severity: 'errors',
			line: 1,
			column: 2,
			message: 'error'
		});
	});

	it('treats a numeric code with no source as ts, as svelte-check omits source for plain .ts files', () => {
		const result = parseSvelteCheck(
			[svelteDiagnostic({ source: undefined }), svelteDiagnostic(), completed].join('\n')
		);
		expect(result.counts).toEqual({ 'src/a.ts': counts(2, 0, 'ts:2322') });
	});

	it('uses the first message line when code is missing and decodes escapes', () => {
		const message = 'Expected "number"\nbut got "string"';
		const result = parseSvelteCheck(svelteDiagnostic({ message, code: undefined }));
		expect(result.diagnostics[0].message).toBe(message);
		expect(result.counts).toEqual({ 'src/a.ts': counts(1, 0, 'message:Expected "number"') });
	});

	it.each(['/repo/src/a.ts', '\\repo\\src\\a.ts', 'src\\a.ts'])(
		'normalizes filename %s to a repo-relative forward-slash path',
		(filename) => {
			const result = parseSvelteCheck(svelteDiagnostic({ filename }), '/repo');
			expect(result.counts).toEqual({ 'src/a.ts': counts(1, 0, 'ts:2322') });
		}
	);

	it('reports missing COMPLETED as incomplete even when diagnostics exist', () => {
		expect(parseSvelteCheck(svelteDiagnostic()).completed).toBe(false);
		expect(parseSvelteCheck('').completed).toBe(false);
	});
});

describe('ESLint JSON output', () => {
	it('counts severities, relativizes absolute paths and omits clean files', () => {
		const result = parseEslint(
			JSON.stringify([
				{
					filePath: '/repo/src/a.ts',
					messages: [
						{ ruleId: 'rule-a', severity: 2, line: 3, column: 4, message: 'error' },
						{ ruleId: 'rule-a', severity: 1, line: 5, column: 6, message: 'warning' }
					]
				},
				{ filePath: '/repo/src/clean.ts', messages: [] }
			]),
			'/repo'
		);
		expect(result.counts).toEqual({ 'src/a.ts': counts(1, 1) });
		expect(result.diagnostics[1]).toEqual({
			file: 'src/a.ts',
			identity: 'rule-a',
			severity: 'warnings',
			line: 5,
			column: 6,
			message: 'warning'
		});
	});

	it('counts fatal parse messages as errors', () => {
		const result = parseEslint(
			JSON.stringify([
				{
					filePath: '/repo/src/broken.ts',
					messages: [
						{ ruleId: null, severity: 2, fatal: true, message: 'Parsing error\nmore detail' }
					]
				}
			]),
			'/repo'
		);
		expect(result.counts).toEqual({ 'src/broken.ts': counts(1, 0, 'fatal:Parsing error') });
	});

	it('rejects invalid JSON and invalid result shapes instead of returning zero', () => {
		for (const output of ['', 'tool crashed', '{}', '[{}]']) {
			expect(() => parseEslint(output, '/repo')).toThrow();
		}
	});
});

describe('baseline comparison', () => {
	it('reports one added svelte-check error in a baselined file', () => {
		const result = compareCounts(
			{ ...empty(), 'svelte-check': { 'src/a.ts': counts(2) } },
			{ ...empty(), 'svelte-check': { 'src/a.ts': counts(3) } }
		);
		expect(result.rises).toEqual([
			{
				tool: 'svelte-check',
				file: 'src/a.ts',
				identity: 'rule-a',
				severity: 'errors',
				baseline: 2,
				current: 3
			}
		]);
		expect(result.failed).toBe(true);
	});

	it('treats a file absent from the baseline as zero', () => {
		const result = compareCounts(empty(), {
			...empty(),
			'svelte-check': { 'src/new.ts': counts(1) }
		});
		expect(result.rises).toEqual([
			{
				tool: 'svelte-check',
				file: 'src/new.ts',
				identity: 'rule-a',
				severity: 'errors',
				baseline: 0,
				current: 1
			}
		]);
		expect(result.failed).toBe(true);
	});

	it('reports a fixed error and builds a lower next baseline', () => {
		const result = compareCounts(
			{ ...empty(), 'svelte-check': { 'src/a.ts': counts(2) } },
			{ ...empty(), 'svelte-check': { 'src/a.ts': counts(1) } }
		);
		expect(result.drops).toEqual([
			{
				tool: 'svelte-check',
				file: 'src/a.ts',
				identity: 'rule-a',
				severity: 'errors',
				baseline: 2,
				current: 1
			}
		]);
		expect(result.nextBaseline['svelte-check']).toEqual({ 'src/a.ts': counts(1) });
		expect(result.failed).toBe(false);
	});

	it('reports neither rises nor drops for equal counts', () => {
		const baseline = { ...empty(), eslint: { 'src/a.ts': counts(2, 1) } };
		const result = compareCounts(baseline, baseline);
		expect(result.rises).toEqual([]);
		expect(result.drops).toEqual([]);
		expect(result.failed).toBe(false);
	});

	it('never offsets a rise in one file with a drop in another', () => {
		const result = compareCounts(
			{ ...empty(), eslint: { 'src/a.ts': counts(2), 'src/b.ts': counts(1) } },
			{ ...empty(), eslint: { 'src/a.ts': counts(1), 'src/b.ts': counts(2) } }
		);
		expect(result.drops).toHaveLength(1);
		expect(result.rises).toHaveLength(1);
		expect(result.failed).toBe(true);
	});

	it.each(['svelte-check', 'eslint'] as const)('ratchets %s warnings independently', (tool) => {
		const result = compareCounts(
			{ ...empty(), [tool]: { 'src/a.ts': counts(1, 1), 'src/b.ts': counts(0, 2) } },
			{ ...empty(), [tool]: { 'src/a.ts': counts(1, 2), 'src/b.ts': counts(0, 1) } }
		);
		expect(result.rises).toEqual([
			{ tool, file: 'src/a.ts', identity: 'rule-a', severity: 'warnings', baseline: 1, current: 2 }
		]);
		expect(result.drops).toEqual([
			{ tool, file: 'src/b.ts', identity: 'rule-a', severity: 'warnings', baseline: 2, current: 1 }
		]);
		expect(result.failed).toBe(true);
	});

	it('removes files that reach zero from the next baseline', () => {
		const result = compareCounts(
			{ ...empty(), eslint: { 'src/a.ts': counts(1), 'src/b.ts': counts(0, 1) } },
			{ ...empty(), eslint: { 'src/a.ts': counts(0) } }
		);
		expect(result.nextBaseline).toEqual(empty());
		expect(result.drops).toHaveLength(2);
	});
});

describe('baseline serialization', () => {
	it('sorts tools, files and identities, drops zeros, uses tabs and a trailing newline', () => {
		expect(
			serializeBaseline({
				'svelte-check': {},
				eslint: {
					'src/z.ts': counts(0),
					'src/b.ts': counts(0, 1),
					'src/a.ts': { ...counts(1, 0, 'z-rule'), ...counts(0), ...counts(2, 0, 'a-rule') }
				}
			})
		).toBe(
			JSON.stringify(
				{
					eslint: {
						'src/a.ts': {
							'a-rule': { errors: 2, warnings: 0 },
							'z-rule': { errors: 1, warnings: 0 }
						},
						'src/b.ts': { 'rule-a': { errors: 0, warnings: 1 } }
					},
					'svelte-check': {}
				},
				null,
				'\t'
			) + '\n'
		);
	});
});
